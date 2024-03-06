import { Env } from './index';

/**
 * Get user information from Toggl
 * @param env Environment variables
 * @returns Toggl response with user information
 */
export async function getMe(env: Env): Promise<any> {
    const me: any = await fetch("https://api.track.toggl.com/api/v9/me", {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": 'Basic ' + btoa(`${env.TOGGL_API_TOKEN}:api_token`)
        }
    }).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }
    ).then(data => {
        return data;
    }).catch(error => {
        console.error("Error fetching me from Toggl", error);
        return [];
    });

    return me;
}

/**
 * Get time entries from Toggl
 * @param startDate Date to start fetching time entries
 * @param endDate Date to end fetching time entries
 * @param env Environment variables
 * @returns Toggl response with time entries
 */
export async function getEntries(startDate: Date, endDate: Date, env: Env): Promise<any> {
    const timeEntries: any = await fetch("https://api.track.toggl.com/api/v9/me/time_entries", {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": 'Basic ' + btoa(`${env.TOGGL_API_TOKEN}:api_token`)
        }
    }).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }).then(data => {
        return data;
    }).catch(error => {
        console.error("Error fetching time entries from Toggl", error);
        return [];
    });

    return timeEntries;
}

/**
 * Get projects from Toggl
 * @param env Environment variables
 * @param workspace_id Workspace ID
 * @returns Toggl response with projects
 */
export async function getProjects(env: Env, workspace_id: string): Promise<any> {
    const projects: any = await fetch("https://api.track.toggl.com/api/v9/workspaces/" + workspace_id + "/projects", {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": 'Basic ' + btoa(`${env.TOGGL_API_TOKEN}:api_token`)
        },
    }).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }).then(data => {
        return data;
    }).catch(error => {
        console.error("Error fetching projects from Toggl", error);
        return [];
    });

    return projects;
}

/**
 * Get workspaces from Toggl
 * @param env Environment variables
 * @returns Toogle response with workspaces
 */
export async function getWorkspaces(env: Env): Promise<any> {
    const workspaces: any = await fetch("https://api.track.toggl.com/api/v9/me/workspaces", {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": 'Basic ' + btoa(`${env.TOGGL_API_TOKEN}:api_token`)
        }
    }).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }).then(data => {
        return data;
    }).catch(error => {
        console.error("Error fetching workspaces from Toggl", error);
        return [];
    });

    return workspaces;
}

/**
 * Get clients from Toggl
 * @param env Environment variables
 * @param workspace_id Workspace ID
 * @returns Toggl response with clients
 */
export async function getClients(env: Env, workspace_id: string): Promise<any> {
    const clients: any = await fetch(`https://api.track.toggl.com/api/v9/workspaces/${workspace_id}/clients`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": 'Basic ' + btoa(`${env.TOGGL_API_TOKEN}:api_token`)
        }
    }).then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }).then(data => {
        return data;
    }).catch(error => {
        console.error("Error fetching clients from Toggl", error);
        return [];
    });

    return clients;
}