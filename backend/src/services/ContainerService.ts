import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import net from 'net';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const CHROME_IMAGE    = process.env.CHROME_IMAGE          || 'lscr.io/linuxserver/chromium:latest';
const VOLUMES_HOST    = process.env.VOLUMES_HOST_PATH     || '/volumes';
const VOLUMES_MOUNT   = process.env.VOLUMES_CONTAINER_PATH || '/volumes';
const DOCKER_NETWORK  = process.env.DOCKER_NETWORK        || 'essentials_essentials';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Absolute host path for a user's volume */
const userHostPath = (username: string) => path.join(VOLUMES_HOST, username);

/** Absolute container-internal path for reading/writing a user's volume dir */
const userMountPath = (username: string) => path.join(VOLUMES_MOUNT, username);

// ── Exports ───────────────────────────────────────────────────────────────────

export type ContainerStatus = 'none' | 'running' | 'saved';

/** Check the current state for a user */
export async function getUserStatus(username: string, dockerContainerId: string | null): Promise<ContainerStatus> {
  if (dockerContainerId) {
    try {
      const container = docker.getContainer(dockerContainerId);
      const info = await container.inspect();
      if (info.State.Running) return 'running';
      // If it exists but is not running, we consider it "saved" (available to resume)
      return 'saved';
    } catch {
      // Container no longer exists — fall through
    }
  }

  const volumeDir = userMountPath(username);
  if (fs.existsSync(volumeDir)) return 'saved';

  return 'none';
}

/** Pull the Chrome image if not already present */
export async function ensureImagePulled(): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.pull(CHROME_IMAGE, (err: any, stream: any) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

/** Create and start a Chrome container for the given user. Returns { containerId }. */
export async function createContainer(username: string): Promise<{ containerId: string }> {
  const containerName = `essentials-chrome-${username}`;

  // Ensure the user's volume directory exists and is owned by abc user (UID 1000)
  const userPath = userMountPath(username);
  if (!fs.existsSync(userPath)) {
    fs.mkdirSync(userPath, { recursive: true });
  }
  
  try {
    // Change ownership to 1000:1000 so the container user can write to it
    fs.chownSync(userPath, 1000, 1000);
  } catch (err) {
    console.warn(`[ContainerService] Could not chown volume ${userPath}:`, err);
  }

  const containerConfig: any = {
    Image: CHROME_IMAGE,
    name:  containerName,
    Env: [
      'PUID=1000',
      'PGID=1000',
      'TZ=Etc/UTC',
    ],
    HostConfig: {
      Binds:      [`${userHostPath(username)}:/config`],
      ShmSize:    1073741824, // 1 GB
      NetworkMode: DOCKER_NETWORK,
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [DOCKER_NETWORK]: {},
      },
    },
  };

  // Pre-cleanup: if a container with this name already exists (even if stopped), remove it
  try {
    const existing = docker.getContainer(containerName);
    await existing.remove({ force: true });
  } catch {
    // Ignore if it doesn't exist
  }

  let container;
  try {
    container = await docker.createContainer(containerConfig);
  } catch (err: any) {
    if (err.statusCode === 404 && err.message?.toLowerCase().includes('no such image')) {
      console.log(`[ContainerService] Image ${CHROME_IMAGE} not found locally. Pulling...`);
      await ensureImagePulled();
      container = await docker.createContainer(containerConfig);
    } else {
      throw err;
    }
  }

  await container.start();

  // Wait for the container's web server (port 3000) to be ready before returning
  const ip = await getContainerIp(container.id);
  await waitForPort(ip, 3000, 10000); // 10s timeout

  return { containerId: container.id };
}

/** Helper to wait for a port to be reachable. */
async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.on('connect', () => { socket.destroy(); resolve(); });
        socket.on('error', (err) => { socket.destroy(); reject(err); });
        socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
        socket.connect(port, host);
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  console.warn(`[ContainerService] Timeout waiting for ${host}:${port} after ${timeoutMs}ms`);
}

/** Stop and remove a container, leaving the volume directory intact. */
export async function stopContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 5 }).catch(() => {}); // Ignore "already stopped"
    await container.remove({ force: true });
  } catch (err: any) {
    if (!err.message?.includes('No such container')) throw err;
  }
}

/** Delete a user's volume directory from disk. */
export async function deleteVolume(username: string): Promise<void> {
  const dir = userMountPath(username);
  if (fs.existsSync(dir)) {
    // Small delay to ensure any container removal has finished releasing the dir
    await new Promise(r => setTimeout(r, 1000));
    
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err: any) {
      console.error(`[ContainerService] Failed to delete volume ${dir}:`, err);
      // Fallback: try renaming it to a "deleted" directory so we can at least free up the username
      const deletedDir = `${dir}-deleted-${Date.now()}`;
      try {
        fs.renameSync(dir, deletedDir);
      } catch {
        throw new Error(`Could not delete or move volume directory: ${err.message}`);
      }
    }
  }
}

/** Resolve the internal Docker IP of a running container. */
export async function getContainerIp(containerId: string): Promise<string> {
  const container = docker.getContainer(containerId);
  const info      = await container.inspect();

  const networks = info.NetworkSettings.Networks;
  const net      = networks[DOCKER_NETWORK] || Object.values(networks)[0];
  if (!net?.IPAddress) throw new Error('Could not determine container IP address.');

  return net.IPAddress;
}
