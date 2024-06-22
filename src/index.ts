import { getEntries, getWorkspaces, getProjects, getClients, getMe } from "./toggl_methods";
import puppeteer, { BrowserWorker } from "@cloudflare/puppeteer";

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
						const daysDue = document.getElementById('daysDue').value;
						if (dueDate !== '') {
							window.location.href = \`/?clientId=${clientId}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&hourlyRate=${hourlyRate}&dueDate=\${dueDate.toISOString()}\`;
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
			});
		}

		let html = await createHtml(allProjects, me, startDate, endDate, clientId, hourlyRate, dueDate, env);
		//let html;
		/*const browser = await puppeteer.launch(env.MYBROWSER);

		allClientIds.forEach(async (id: number) => {
			try {
				console.log(`Creating PDF for client ${id}`);
				html = await createHtml(allProjects, me, startDate, endDate, id, env);
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

async function createHtml(allProjects: any, me: any, startDate: Date, endDate: Date, clientId: number, hourlyRate: number, dueDate: string, env: Env) {
	const workspace = allProjects[0].workspace;
	// if a client Id is not present on workspace, throw an error
	if (allProjects[0].clients.find((client: any) => client.client.id === clientId) === undefined) {
		throw new Error('Client ID not found');
	}
	const client = allProjects[0].clients.find((client: any) => client.client.id === clientId);
	// create rows for the table
	let tableRowsContent = '';
	client.projects.map((project: any) => {
		project.entries.map((entry: any) => {
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
				<td>${(entry.duration / 3600).toFixed(2)}</td>
				<td>$${hourlyRate.toFixed(2)}</td>
				<td>$${((entry.duration / 3600) * hourlyRate).toFixed(2)}</td>
			</tr>`;
		});
	});
	let totalsContent = `
		<section id='totals'> 
			<p>
				<b>Total Hours: </b> 
				<span>
					${(client.projects.reduce((a: any, b: any) => {
		return a + b.entries.reduce((c: any, d: any) => c + d.duration, 0);
	}, 0) / 3600).toFixed(2)
		}
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
					$${((client.projects.reduce((a: any, b: any) => {
			return a + b.entries.reduce((c: any, d: any) => c + d.duration, 0);
		}, 0) /
			3600) *
			hourlyRate).toFixed(2)
		}
				</span>
			</p>
			<p>
				<b>Due Date: </b>
				<span>
					${dueDate}
				</span>
			</p>
		</section>`;

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
<table><tr> <th>Date</th> <th>Project/Task</th> <th>Start</th> <th>Stop</th> <th>Hours</th> <th>Rate</th> <th>Total</th> </tr>${tableRowsContent}</table></section>${totalsContent}<section> <p> <b>Notice: </b>This invoice is dynamically generated from Toggl data and may be incomplete. The hour totals listed are rounded from the actual time tracked (in milliseconds). The total hours may be slightly off as a result. However, the amount due is calculated 
off the seconds recorded. Timezones are in US EST (New York). Please contact ${me.fullname
		} if you have any questions or require clarification on any item. Thanks! </p> </section> <div id="options"><button onclick="window.print();"><svg xmlns="http://www.w3.org/2000/svg" height="34" width="34" viewBox="0 0 48 48"><path d="M32.9 15.6V9H15.1v6.6h-3V6h23.8v9.6ZM7 18.6h34-28.9Zm29.95 4.75q.6 0 1.05-.45.45-.45.45-1.05 0-.6-.45-1.05-.45-.45-1.05-.45-.6 0-1.05.45-.45.45-.45 1.05 0 .6.45 1.05.45.45 1.05.45ZM32.9 39v-9.6H15.1V39Zm3 3H12.1v-8.8H4V20.9q0-2.25 1.525-3.775T9.3 15.6h29.4q2.25 0 3.775 1.525T44 20.9v12.3h-8.1ZM41 30.2v-9.3q0-1-.65-1.65-.65-.65-1.65-.65H9.3q-1 0-1.65.65Q7 19.9 7 20.9v9.3h5.1v-3.8h23.8v3.8Z" /></svg></button></div></body></html>
		<script>window.onbeforeprint = function() { document.getElementById('options').style.display = 'none'; }; window.onafterprint = function() { document.getElementById('options').style.display = 'flex'; }; </script>`;
	return html;
}
