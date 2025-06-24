import { getEntries, getWorkspaces, getProjects, getClients, getMe } from "./toggl_methods";
import puppeteer, { BrowserWorker } from "@cloudflare/puppeteer";

// Rounding behavior types and functions
type RoundingBehavior = 'none' | 'up_decimal' | 'up_minute' | 'up_5mins' | 'up_15mins' | 'up_30mins' | 'up_hour' | 'down_decimal' | 'down_5mins' | 'down_15mins' | 'down_30mins' | 'down_hour' | 'nearest_decimal' | 'nearest_minute' | 'nearest_5mins' | 'nearest_15mins' | 'nearest_30mins' | 'nearest_hour';

function applyRounding(totalHours: number, behavior: RoundingBehavior): { rounded: number, wasRounded: boolean } {
	const original = totalHours;
	let rounded = totalHours;

	switch (behavior) {
		case 'none':
			return { rounded: totalHours, wasRounded: false };
		case 'up_decimal':
			rounded = Math.ceil(totalHours * 100) / 100;
			break;
		case 'up_minute':
			rounded = Math.ceil(totalHours * 60) / 60;
			break;
		case 'up_5mins':
			rounded = Math.ceil(totalHours * 12) / 12; // 60/5 = 12
			break;
		case 'up_15mins':
			rounded = Math.ceil(totalHours * 4) / 4; // 60/15 = 4
			break;
		case 'up_30mins':
			rounded = Math.ceil(totalHours * 2) / 2; // 60/30 = 2
			break;
		case 'up_hour':
			rounded = Math.ceil(totalHours);
			break;
		case 'down_decimal':
			rounded = Math.floor(totalHours * 100) / 100;
			break;
		case 'down_5mins':
			rounded = Math.floor(totalHours * 12) / 12;
			break;
		case 'down_15mins':
			rounded = Math.floor(totalHours * 4) / 4;
			break;
		case 'down_30mins':
			rounded = Math.floor(totalHours * 2) / 2;
			break;		case 'down_hour':
			rounded = Math.floor(totalHours);
			break;
		case 'nearest_decimal':
			rounded = Math.round(totalHours * 100) / 100;
			break;
		case 'nearest_minute':
			rounded = Math.round(totalHours * 60) / 60;
			break;
		case 'nearest_5mins':
			rounded = Math.round(totalHours * 12) / 12; // 60/5 = 12
			break;
		case 'nearest_15mins':
			rounded = Math.round(totalHours * 4) / 4; // 60/15 = 4
			break;
		case 'nearest_30mins':
			rounded = Math.round(totalHours * 2) / 2; // 60/30 = 2
			break;
		case 'nearest_hour':
			rounded = Math.round(totalHours);
			break;
		default:
			return { rounded: totalHours, wasRounded: false };
	}

	return { rounded, wasRounded: Math.abs(original - rounded) > 0.001 };
}

function getRoundingBehaviorDescription(behavior: RoundingBehavior): string {
	switch (behavior) {
		case 'none': return 'No rounding applied';
		case 'up_decimal': return 'Rounded up to two decimal places';
		case 'up_minute': return 'Rounded up to the nearest minute';
		case 'up_5mins': return 'Rounded up to the nearest 5 minutes';
		case 'up_15mins': return 'Rounded up to the nearest 15 minutes';
		case 'up_30mins': return 'Rounded up to the nearest 30 minutes';
		case 'up_hour': return 'Rounded up to the nearest hour';
		case 'down_decimal': return 'Rounded down to two decimal places';
		case 'down_5mins': return 'Rounded down to the nearest 5 minutes';		case 'down_15mins': return 'Rounded down to the nearest 15 minutes';
		case 'down_30mins': return 'Rounded down to the nearest 30 minutes';
		case 'down_hour': return 'Rounded down to the nearest hour';
		case 'nearest_decimal': return 'Rounded to the nearest two decimal places';
		case 'nearest_minute': return 'Rounded to the nearest minute';
		case 'nearest_5mins': return 'Rounded to the nearest 5 minutes';
		case 'nearest_15mins': return 'Rounded to the nearest 15 minutes';
		case 'nearest_30mins': return 'Rounded to the nearest 30 minutes';
		case 'nearest_hour': return 'Rounded to the nearest hour';
		default: return 'No rounding applied';
	}
}

export interface Env {
	BUCKET: R2Bucket; 
	MYBROWSER: BrowserWorker;

	TOGGL_API_TOKEN: string;
	ONLY_WORKSPACE: string;
	YOUR_PHONE: string;
	YOUR_ADDRESS: string;
}

export default {
	// The scheduled handler is invoked at the interval set in our wrangler.toml's
	// [[triggers]] configuration.
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		const endDate = new Date();
		const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
		console.log(`Start date: ${startDate.toISOString()}`);
	},
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// ex: http://127.0.0.1:8787/?startDate=2024-02-15T00:00:00.000Z&endDate=2024-02-29T23:59:59.000Z
		let url: URL = new URL(request.url);

		// if /favicon.ico is requested, return a 204 No Content response
		if (url.pathname === '/favicon.ico') {
			return new Response(null, {
				status: 204,
				headers: {
					'Content-Type': 'image/x-icon',
				},
			});
		}

		// get the startDate and endDate from the query string
		let startDate: Date;
		let endDate: Date;
		let clientId: number;
		let hourlyRate: number;

		// if startDate is provided, use it, otherwise default to 7 days ago
		if (url.searchParams.has('startDate')) {
			try {
				startDate = new Date(url.searchParams.get('startDate') as string);
				if (url.searchParams.has('endDate')) {
					endDate = new Date(url.searchParams.get('endDate') as string);
				} else {
					endDate = new Date();
				}
			} catch (e) {
				return new Response(
					JSON.stringify({
						error: 'Invalid date',
					}),
					{
						status: 400,
						headers: {
							'Content-Type': 'application/json',
						},
					}
				);
			}
		} else {
			// the last second of today
			endDate = new Date(new Date().setUTCHours(23, 59, 59, 999));
			startDate = new Date(new Date(endDate.getTime() - 13 * 24 * 60 * 60 * 1000).setUTCHours(0, 0, 0, 0));
			url.searchParams.set('startDate', startDate.toISOString());
			url.searchParams.set('endDate', endDate.toISOString());
			return Response.redirect(url.toString(), 302);
		}

		const allProjects = await getTogglData(env, startDate, endDate);
		const me = await getMe(env);

		allProjects.map((project: any) => {
			//console.log(`Workspace: ${project.workspace.name}`);
			project.clients.map((client: any) => {
				let total = 0;
				//console.log(`Client: ${client.client.name}`);
				client.projects.map((project: any) => {
					//console.log(`Project: ${project.project.name}`);
					project.entries.map((entry: any) => {
						//console.log(`Entry: ${entry.description}`);
						total += entry.duration;
					});
				});
				//console.log(`Total: ${total}`);
			});
		});

		if (url.searchParams.has('clientId') && url.searchParams.get('clientId') !== '') {
			clientId = parseInt(url.searchParams.get('clientId') as string);
		} else {
			clientId = allProjects[0].clients[0].client.id;
			const selectClientHtml = `
			<!DOCTYPE html>
			<html lang='en'>
			<head>
				<meta charset='UTF-8'>
				<meta http-equiv='X-UA-Compatible' content='IE=edge'>
				<meta name='viewport' content='width=device-width, initial-scale=1.0'>
				<title>Select Client</title>
				<style>
					body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; max-width: 480px; margin: 20px auto; }
					h1 { font-size: 35px; margin-bottom: 10px; }
					form { display: flex; flex-direction: column; }
					label { margin-bottom: 10px; }
					select { padding: 10px; margin-bottom: 20px; }
					button { padding: 10px; background-color: #4CAF50; color: white; cursor: pointer; }
				</style>
			</head>
			<body>
				<h1>Select a Client</h1>
				<form action='/' method='get'>
					<select name='clientId' id='clientId'>
						${allProjects[0].clients.map((client: any) => `<option value='${client.client.id}'>${client.client.name}</option>`)}
					</select>
					<input type='hidden' name='startDate' value='${startDate.toISOString()}'>
					<input type='hidden' name='endDate' value='${endDate.toISOString()}'>
					<button type='submit'>Submit</button>
				</form>
			</body>
			</html>`;
			return new Response(selectClientHtml, {
				status: 200,
				headers: {
					'Content-Type': 'text/html',
				},
			});
		}
		const allClientIds = allProjects[0].clients.map((client: any) => client.client.id);
		console.log(`All Client IDs: ${allClientIds}`);
		console.log(`Client ID: ${clientId}`);

		if (url.searchParams.has('hourlyRate') && parseFloat(url.searchParams.get('hourlyRate') as string) > 0) {
			hourlyRate = parseFloat(url.searchParams.get('hourlyRate') as string);
		} else {
			const selectRateHtml = `
			<!DOCTYPE html>
			<html lang='en'>
			<head>
				<meta charset='UTF-8'>
				<meta http-equiv='X-UA-Compatible' content='IE=edge'>
				<meta name='viewport' content='width=device-width, initial-scale=1.0'>
				<title>Enter Hourly Rate</title>
				<style>
					body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; max-width: 480px; margin: 20px auto; }
					h1 { font-size: 35px; margin-bottom: 10px; }
					form { display: flex; flex-direction: column; }
					label { margin-bottom: 10px; }
					input { padding: 10px; margin-bottom: 20px; }
					button { padding: 10px; background-color: #4CAF50; color: white; cursor: pointer; }
				</style>
			</head>
			<body>
				<h1>Hourly Rate</h1>
				<form action='/' method='get'>
					<label for='hourlyRate'>Hourly Rate:</label>
					<input type='number' name='hourlyRate' id='hourlyRate' step='0.01' required>
					<input type='hidden' name='clientId' value='${clientId}'>
					<input type='hidden' name='startDate' value='${startDate.toISOString()}'>
					<input type='hidden' name='endDate' value='${endDate.toISOString()}'>
					<button type='submit'>Submit</button>
				</form>
			</body>
			</html>`;
			return new Response(selectRateHtml, {
				status: 200,
				headers: {
					'Content-Type': 'text/html',
				},
			});
		}

		// due date (default to 30 days from now but ask for input)
		let dueDate: string;
		if ((url.searchParams.has('dueDate') && url.searchParams.get('dueDate') !== '' && new Date(url.searchParams.get('dueDate') as string) > new Date()) || (url.searchParams.has('daysDue') && parseInt(url.searchParams.get('daysDue') as string) > 0)) {
			if (url.searchParams.has('daysDue') && parseInt(url.searchParams.get('daysDue') as string) > 0) {
				dueDate = new Date(new Date().getTime() + parseInt(url.searchParams.get('daysDue') as string) * 24 * 60 * 60 * 1000).toDateString();
			} else {
				dueDate = url.searchParams.get('dueDate') as string;
			}
		} else {
			const selectDueDateHtml = `
			<!DOCTYPE html>
			<html lang='en'>
			<head>
				<meta charset='UTF-8'>
				<meta http-equiv='X-UA-Compatible' content='IE=edge'>
				<meta name='viewport' content='width=device-width, initial-scale=1.0'>
				<title>Select Due Date</title>
				<style>
					body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; max-width: 480px; margin: 20px auto; }
					h1 { font-size: 35px; margin-bottom: 10px; }
					form { display: flex; flex-direction: column; }
					label { margin-bottom: 10px; }
					input { padding: 10px; margin-bottom: 20px; }
					button { padding: 10px; background-color: #4CAF50; color: white; cursor: pointer; }
				</style>
			</head>
			<body>
				<h1>Select Due Date</h1>
				<form action='/' method='none' id='dueDateForm'>
					<label for='dueDate'>Due Date:</label>
					<input type='date' name='dueDate' id='dueDate' min='${new Date().toISOString().split('T')[0]}'>
					<label for='daysDue'>Days:</label>
					<input type='number' name'daysDue' id='daysDue' min='1' value='30'>
					<input type='hidden' name='clientId' value='${clientId}'>
					<input type='hidden' name='startDate' value='${startDate.toISOString()}'>
					<input type='hidden' name='endDate' value='${endDate.toISOString()}'>
					<input type='hidden' name='hourlyRate' value='${hourlyRate}'>
					<button type='submit'>Submit</button>
				</form>
				<script>
					document.getElementById('dueDateForm').addEventListener('submit', (e) => {
						e.preventDefault();
						const dueDate = document.getElementById('dueDate').value;
						const daysDue = document.getElementById('daysDue').value;						if (dueDate !== '') {
							window.location.href = \`/?clientId=${clientId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&hourlyRate=${hourlyRate}&dueDate=\${dueDate}\`;
							return;
						}
						if (daysDue !== '' || (daysDue === '' && dueDate === '')) {
							window.location.href = \`/?clientId=${clientId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&hourlyRate=${hourlyRate}&daysDue=\${daysDue}\`;
							return;
						}
					});
				</script>
			</body>
			</html>`;
			return new Response(selectDueDateHtml, {
				status: 200,
				headers: {
					'Content-Type': 'text/html',
				},
			});		}
		// total rounding behavior (default to none)
		let totalRoundingBehavior: RoundingBehavior;
		let itemRoundingBehavior: RoundingBehavior;
		if (url.searchParams.has('totalRoundingBehavior') && url.searchParams.get('totalRoundingBehavior') !== '' && url.searchParams.has('itemRoundingBehavior') && url.searchParams.get('itemRoundingBehavior') !== '') {
			totalRoundingBehavior = url.searchParams.get('totalRoundingBehavior') as RoundingBehavior;
			itemRoundingBehavior = url.searchParams.get('itemRoundingBehavior') as RoundingBehavior;
		} else {
			const selectRoundingHtml = `
			<!DOCTYPE html>
			<html lang='en'>
			<head>
				<meta charset='UTF-8'>
				<meta http-equiv='X-UA-Compatible' content='IE=edge'>
				<meta name='viewport' content='width=device-width, initial-scale=1.0'>
				<title>Select Rounding Behaviors</title>
				<style>
					body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; max-width: 480px; margin: 20px auto; }
					h1 { font-size: 35px; margin-bottom: 10px; }
					h2 { font-size: 20px; margin-bottom: 10px; margin-top: 20px; }
					form { display: flex; flex-direction: column; }
					label { margin-bottom: 10px; font-weight: bold; }
					select { padding: 10px; margin-bottom: 20px; }
					button { padding: 10px; background-color: #4CAF50; color: white; cursor: pointer; }
				</style>
			</head>
			<body>
				<h1>Timesheet Rounding</h1>
				<form action='/' method='get'>
					<h2>Total Hours Rounding</h2>
					<label for='totalRoundingBehavior'>Total Rounding Behavior:</label>
					<select name='totalRoundingBehavior' id='totalRoundingBehavior'>
						<option value='none'>None (Default)</option>
						<optgroup label='Round Up'>
							<option value='up_decimal'>Up: Two Decimal Places</option>
							<option value='up_minute'>Up: Minute</option>
							<option value='up_5mins'>Up: 5 Minutes</option>
							<option value='up_15mins'>Up: 15 Minutes</option>
							<option value='up_30mins'>Up: 30 Minutes</option>
							<option value='up_hour'>Up: Hour</option>
						</optgroup>
						<optgroup label='Round Down'>
							<option value='down_decimal'>Down: Two Decimal Places</option>
							<option value='down_5mins'>Down: 5 Minutes</option>
							<option value='down_15mins'>Down: 15 Minutes</option>
							<option value='down_30mins'>Down: 30 Minutes</option>
							<option value='down_hour'>Down: Hour</option>
						</optgroup>
						<optgroup label='Round Nearest'>
							<option value='nearest_decimal'>Nearest: Two Decimal Places</option>
							<option value='nearest_minute'>Nearest: Minute</option>
							<option value='nearest_5mins'>Nearest: 5 Minutes</option>
							<option value='nearest_15mins'>Nearest: 15 Minutes</option>
							<option value='nearest_30mins'>Nearest: 30 Minutes</option>
							<option value='nearest_hour'>Nearest: Hour</option>
						</optgroup>
					</select>
					
					<h2>Individual Item Rounding</h2>
					<label for='itemRoundingBehavior'>Item Rounding Behavior:</label>
					<select name='itemRoundingBehavior' id='itemRoundingBehavior'>
						<option value='none'>None (Default)</option>
						<optgroup label='Round Up'>
							<option value='up_decimal'>Up: Two Decimal Places</option>
							<option value='up_minute'>Up: Minute</option>
							<option value='up_5mins'>Up: 5 Minutes</option>
							<option value='up_15mins'>Up: 15 Minutes</option>
							<option value='up_30mins'>Up: 30 Minutes</option>
							<option value='up_hour'>Up: Hour</option>
						</optgroup>
						<optgroup label='Round Down'>
							<option value='down_decimal'>Down: Two Decimal Places</option>
							<option value='down_5mins'>Down: 5 Minutes</option>
							<option value='down_15mins'>Down: 15 Minutes</option>
							<option value='down_30mins'>Down: 30 Minutes</option>
							<option value='down_hour'>Down: Hour</option>
						</optgroup>
						<optgroup label='Round Nearest'>
							<option value='nearest_decimal'>Nearest: Two Decimal Places</option>
							<option value='nearest_minute'>Nearest: Minute</option>
							<option value='nearest_5mins'>Nearest: 5 Minutes</option>
							<option value='nearest_15mins'>Nearest: 15 Minutes</option>
							<option value='nearest_30mins'>Nearest: 30 Minutes</option>
							<option value='nearest_hour'>Nearest: Hour</option>
						</optgroup>
					</select>
					
					<input type='hidden' name='clientId' value='${clientId}'>
					<input type='hidden' name='startDate' value='${startDate.toISOString()}'>
					<input type='hidden' name='endDate' value='${endDate.toISOString()}'>
					<input type='hidden' name='hourlyRate' value='${hourlyRate}'>
					<input type='hidden' name='dueDate' value='${dueDate}'>
					<button type='submit'>Submit</button>
				</form>
			</body>
			</html>`;
			return new Response(selectRoundingHtml, {
				status: 200,
				headers: {
					'Content-Type': 'text/html',
				},
			});
		}

		let html = await createHtml(allProjects, me, startDate, endDate, clientId, hourlyRate, dueDate, totalRoundingBehavior, itemRoundingBehavior, env);
		//let html;
		/*const browser = await puppeteer.launch(env.MYBROWSER);

		allClientIds.forEach(async (id: number) => {
			try {
				console.log(`Creating PDF for client ${id}`);
				html = await createHtml(allProjects, me, startDate, endDate, id, hourlyRate, dueDate, totalRoundingBehavior, itemRoundingBehavior, env);
				const page = await browser.newPage();
				await page.setContent(html);
				await page.waitForNetworkIdle();
				const pdf = await page.pdf({ format: 'A4' });
				await env.BUCKET.put(`${id}-${startDate.toISOString()}-${endDate.toISOString()}-timesheet.pdf`, pdf);
				await page.close();
				console.log(`PDF created for client ${id}`);
			} catch (e) {
				console.error(`Error creating PDF for client ${id}`, e);
			}
		});
		await browser.close();*/

		return new Response(html, {
			status: 200,
			headers: {
				'Content-Type': 'text/html',
			},
		});
	}
};


async function getTogglData(env: Env, startDate: Date, endDate: Date) {
	let workspaces = await getWorkspaces(env);
	if (env.ONLY_WORKSPACE) {
		if (env.ONLY_WORKSPACE.length > 0) {
			const onlyWorkspaces = env.ONLY_WORKSPACE.split(',').map((id: string) => parseInt(id));
			workspaces = workspaces.filter((workspace: any) => onlyWorkspaces.includes(workspace.id));
		}
	}
	let allProjects: any = [];
	for (let workspace of workspaces) {
		const clients = await getClients(env, workspace.id);
		const projects = await getProjects(env, workspace.id);
		const entries = await getEntries(startDate, endDate, env);
		allProjects.push({
			workspace: workspace,
			clients: clients.map((client: any) => {
				return {
					client: client,
					projects: projects.filter((project: any) => project.cid === client.id).map((project: any) => {
						return {
							project: project,
							entries: entries.filter((entry: any) => entry.pid === project.id),
						};
					}),
				};
			}),
		});
	}
	return allProjects;
}

async function createHtml(allProjects: any, me: any, startDate: Date, endDate: Date, clientId: number, hourlyRate: number, dueDate: string, totalRoundingBehavior: RoundingBehavior, itemRoundingBehavior: RoundingBehavior, env: Env) {
	const workspace = allProjects[0].workspace;
	// if a client Id is not present on workspace, throw an error
	if (allProjects[0].clients.find((client: any) => client.client.id === clientId) === undefined) {
		throw new Error('Client ID not found');
	}
	const client = allProjects[0].clients.find((client: any) => client.client.id === clientId);	// create rows for the table
	let tableRowsContent = '';
	let itemsWereRounded = false;
	client.projects.map((project: any) => {
		project.entries.map((entry: any) => {
			const rawItemHours = entry.duration / 3600;
			const { rounded: roundedItemHours, wasRounded: itemWasRounded } = applyRounding(rawItemHours, itemRoundingBehavior);
			if (itemWasRounded) itemsWereRounded = true;
			
			tableRowsContent += `
			<tr>
				<td>${new Date(entry.start).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'numeric',
				day: 'numeric',
				timeZone: 'America/New_York',
			})}</td>
				<td>${project.project.name} - ${entry.description}</td>
				<td>${new Date(entry.start).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'America/New_York',
			})}</td>
				<td>${new Date(entry.stop).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'America/New_York',
			})}</td>
				<td>${itemWasRounded ? '~' : ''}${roundedItemHours.toFixed(2)}</td>
				<td>$${hourlyRate.toFixed(2)}</td>
				<td>$${(roundedItemHours * hourlyRate).toFixed(2)}</td>
			</tr>`;
		});	});	
	// Calculate total hours - use rounded items if item rounding is applied, otherwise use raw totals
	let totalHoursForCalculation: number;
	if (itemRoundingBehavior !== 'none') {
		// Sum up the rounded individual items
		totalHoursForCalculation = client.projects.reduce((a: any, b: any) => {
			return a + b.entries.reduce((c: any, d: any) => {
				const rawItemHours = d.duration / 3600;
				const { rounded: roundedItemHours } = applyRounding(rawItemHours, itemRoundingBehavior);
				return c + roundedItemHours;
			}, 0);
		}, 0);
	} else {
		// Use raw total seconds converted to hours
		const rawTotalSeconds = client.projects.reduce((a: any, b: any) => {
			return a + b.entries.reduce((c: any, d: any) => c + d.duration, 0);
		}, 0);
		totalHoursForCalculation = rawTotalSeconds / 3600;
	}
	
	// Apply total rounding behavior to the calculated total
	const { rounded: roundedTotalHours, wasRounded: totalWasRounded } = applyRounding(totalHoursForCalculation, totalRoundingBehavior);
	const roundedAmountDue = roundedTotalHours * hourlyRate;
		let totalsContent = `
		<section id='totals'> 
			<p>
				<b>Total Hours: </b> 
				<span>
					${totalWasRounded ? '~' : ''}${roundedTotalHours.toFixed(2)}
				</span>
			</p>
			<p>
				<b>Hourly Rate: </b> 
				<span>
					$${hourlyRate.toFixed(2)}
				</span>
			</p>
			<p>
				<b>Amount Due: </b>
				<span>
					$${roundedAmountDue.toFixed(2)}
				</span>
			</p>
			<p>
				<b>Due Date: </b>
				<span>
					${dueDate}
				</span>
			</p>
		</section>`;	// Create notice text based on rounding behaviors
	const totalRoundingDescription = getRoundingBehaviorDescription(totalRoundingBehavior);
	const itemRoundingDescription = getRoundingBehaviorDescription(itemRoundingBehavior);
	
	// Base notice about dynamic generation
	const baseNotice = "This invoice is dynamically generated from Toggl data and may be incomplete.";
	
	// Individual item rounding notice
	let itemNotice = "";
	if (itemRoundingBehavior !== 'none') {
		itemNotice = ` Individual time entries have been ${itemRoundingDescription.toLowerCase()}.`;
	} else {
		itemNotice = " Individual time entries show the actual time tracked (in hours with two decimal precision).";
	}
	
	// Total hours rounding notice
	let totalNotice = "";
	if (totalRoundingBehavior !== 'none') {
		if (itemRoundingBehavior !== 'none') {
			totalNotice = ` The total hours and amount due are calculated from the rounded individual entries, then ${totalRoundingDescription.toLowerCase()}.`;
		} else {
			totalNotice = ` The total hours and amount due have been ${totalRoundingDescription.toLowerCase()}.`;
		}
	} else {
		if (itemRoundingBehavior !== 'none') {
			totalNotice = " The total hours and amount due are calculated by summing the rounded individual entries.";
		} else {
			totalNotice = " The total hours and amount due are calculated from the actual time tracked (in seconds).";
		}
	}
	
	// Timezone and contact info
	const timezoneNotice = " Timezones are in US EST (New York).";
	const contactNotice = ` Please contact ${me.fullname} if you have any questions or require clarification on any item. Thanks!`;
	
	const fullNotice = baseNotice + itemNotice + totalNotice + timezoneNotice + contactNotice;

	const html = `<!DOCTYPE html><html lang='en'><head> <meta charset='UTF-8'> <meta http-equiv='X-UA-Compatible' content='IE=edge'> <meta name='viewport' content='width=device-width, initial-scale=1.0'> <title>${workspace.name
		} Timesheet for ${client.client.name} for ${startDate.getMonth() + 1}/${startDate.getDate()}/${startDate.getFullYear()} - ${endDate.getMonth() + 1
		}/${endDate.getDate()}/${endDate.getFullYear()}</title></head><body> <style> 
body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; max-width: 1080px; margin: 20px auto; } header { margin-bottom: 20px; } #meta { display: flex; justify-content: space-between; } h1 { font-size: 35px; margin-bottom: 10px; } p { margin: 0; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ddd; padding: 8px; } tr:nth-child(even) { background-color: #f2f2f2; } tr:hover { background-color: #ddd; } 
th { padding-top: 12px; padding-bottom: 12px; text-align: left; background-color: #4CAF50; color: white; } #totals { margin-top: 20px; font-size: 16px; max-width: fit-content; margin-left: auto; padding: 10px; border: 1px solid rgb(192, 192, 192); } #totals p { margin: 5px 0; display: flex; justify-content: space-between; } #totals p span { margin-left: 20px; } section { margin-top: 20px; } #options {position: fixed;bottom: 10px;left: 50%;transform: translateX(-50%);height: 30px;display: flex;justify-content: space-between;align-items: center;gap: 10px;padding: 15px;border-radius: 50px;background-color: #4CAF50;} #options button,#options a {padding: 10px;border-radius: 5px;text-decoration: none;border: 0px solid transparent;background-color: transparent;color: #4CAF50;font-size: 16px;cursor: pointer;} #options svg { fill: #fff; padding-top: 5px;border: 2px solid transparent; } #options button:hover svg,#options button:active svg,#options a:hover svg,#options a:active svg {box-shadow: 0 0 50px 2px #fff;border-radius: 18px;background-color: rgba(255, 255, 255, 0.278);} footer { margin-top: 20px; } /* print styles */ 
@media print { a {  color: #000 !important;  text-decoration: none !important; } } </style> <header> <h1>${workspace.name} ${client.client.name
		} Timesheet</h1> <div id='meta'> <div>  <p>  <b>Client: </b> <span>${client.client.name
		}</span>  </p>  <p>  <b>Invoice Date: </b> <span>${new Date().toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'America/New_York',
		})}</span>  </p>  <p>  <b>Invoice Period: </b> <span>${startDate.getMonth() + 1}/${startDate.getDate()}/${startDate.getFullYear()} - ${endDate.getMonth() + 1
		}/${endDate.getDate()}/${endDate.getFullYear()}</span>  </p> </div> <div>  <p>  <b>Contractor: </b> <span>${workspace.name
		}</span>  </p>  <p>  <b>Email: </b> <span>${me.email}</span>  </p>  <p>  <b> Phone: </b> <span>${env.YOUR_PHONE
		}</span>  </p>  <p>  <b>Address: </b> <span>${env.YOUR_ADDRESS}</span>  </p> </div> </div> </header><section> 
<table><tr> <th>Date</th> <th>Project/Task</th> <th>Start</th> <th>Stop</th> <th>Hours</th> <th>Rate</th> <th>Total</th> </tr>${tableRowsContent}</table></section>${totalsContent}<section> <p> <b>Notice: </b>${fullNotice} </p> </section> <div id="options"><button onclick="window.print();"><svg xmlns="http://www.w3.org/2000/svg" height="34" width="34" viewBox="0 0 48 48"><path d="M32.9 15.6V9H15.1v6.6h-3V6h23.8v9.6ZM7 18.6h34-28.9Zm29.95 4.75q.6 0 1.05-.45.45-.45.45-1.05 0-.6-.45-1.05-.45-.45-1.05-.45-.6 0-1.05.45-.45.45-.45 1.05 0 .6.45 1.05.45.45 1.05.45ZM32.9 39v-9.6H15.1V39Zm3 3H12.1v-8.8H4V20.9q0-2.25 1.525-3.775T9.3 15.6h29.4q2.25 0 3.775 1.525T44 20.9v12.3h-8.1ZM41 30.2v-9.3q0-1-.65-1.65-.65-.65-1.65-.65H9.3q-1 0-1.65.65Q7 19.9 7 20.9v9.3h5.1v-3.8h23.8v3.8Z" /></svg></button></div></body></html>
		<script>window.onbeforeprint = function() { document.getElementById('options').style.display = 'none'; }; window.onafterprint = function() { document.getElementById('options').style.display = 'flex'; }; </script>`;
	return html;
}
