import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const CHROME_IMAGE    = process.env.CHROME_IMAGE          || 'kasmweb/chromium:1.15.0';
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

  // Ensure the user's volume directory exists and is owned by kasm_user (UID 1000)
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
      'VNC_PW=password',
      'RESOLUTION=1280x720',
    ],
    HostConfig: {
      Binds:      [`${userHostPath(username)}:/home/kasm-user`],
      ShmSize:    268435456, // 256 MB
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
  return { containerId: container.id };
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
    fs.rmSync(dir, { recursive: true, force: true });
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
