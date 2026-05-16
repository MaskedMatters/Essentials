import Docker from 'dockerode';
import fs from 'fs';
import path from 'path';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  stats?: {
    cpuPercent: number;
    memoryUsage: number;
    memoryLimit: number;
    memoryPercent: number;
    netIO: { rx: number; tx: number };
    blockIO: { read: number; write: number };
  };
}

export class DockerService {
  /**
   * List all containers on the system.
   */
  static async listAllContainers(): Promise<ContainerInfo[]> {
    const containers = await docker.listContainers({ all: true });
    return containers.map(c => ({
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, '') || c.Id.substring(0, 12),
      image: c.Image,
      state: c.State,
      status: c.Status,
    }));
  }

  /**
   * Get real-time stats for a container.
   * This is a one-shot fetch for the dashboard.
   */
  static async getContainerStats(containerId: string): Promise<any> {
    try {
      const container = docker.getContainer(containerId);
      // We use stream: false to get a single snapshot
      const stats = await container.stats({ stream: false });
      return this.formatStats(stats);
    } catch (err) {
      console.error(`[DockerService] Error fetching stats for ${containerId}:`, err);
      return null;
    }
  }

  /**
   * Perform an action on a container.
   */
  static async performAction(containerId: string, action: 'start' | 'stop' | 'restart' | 'kill' | 'remove'): Promise<void> {
    const container = docker.getContainer(containerId);
    switch (action) {
      case 'start': await container.start(); break;
      case 'stop': await container.stop(); break;
      case 'restart': await container.restart(); break;
      case 'kill': await container.kill(); break;
      case 'remove': await container.remove({ force: true }); break;
    }
  }

  /**
   * Helper to format raw Docker stats into human-readable percentages and bytes.
   */
  private static formatStats(stats: any) {
    // CPU Percentage calculation
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100.0 : 0;

    // Memory
    const memoryUsage = stats.memory_stats.usage - (stats.memory_stats.stats?.cache || 0);
    const memoryLimit = stats.memory_stats.limit;
    const memoryPercent = (memoryUsage / memoryLimit) * 100.0;

    // Network I/O
    let rx = 0, tx = 0;
    if (stats.networks) {
      for (const key of Object.keys(stats.networks)) {
        rx += stats.networks[key].rx_bytes;
        tx += stats.networks[key].tx_bytes;
      }
    }

    // Block I/O
    let read = 0, write = 0;
    if (stats.blkio_stats?.io_service_bytes_recursive) {
      for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
        if (entry.op === 'Read') read += entry.value;
        if (entry.op === 'Write') write += entry.value;
      }
    }

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsage,
      memoryLimit,
      memoryPercent: Math.round(memoryPercent * 100) / 100,
      netIO: { rx, tx },
      blockIO: { read, write }
    };
  }

  /**
   * List all saved workspace volumes on disk.
   */
  static async listSavedWorkspaces(): Promise<string[]> {
    const volumesPath = process.env.VOLUMES_CONTAINER_PATH || '/volumes';
    if (!fs.existsSync(volumesPath)) return [];
    
    const dirs = fs.readdirSync(volumesPath, { withFileTypes: true });
    return dirs
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }

  /**
   * Delete a workspace volume.
   */
  static async deleteWorkspaceVolume(username: string): Promise<void> {
    const volumesPath = process.env.VOLUMES_CONTAINER_PATH || '/volumes';
    const dir = path.join(volumesPath, username);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}
