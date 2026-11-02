import Dockerode from 'dockerode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateProjectDir,
  validateDockerfilePath,
  validatePortMapping,
  validateImageName,
  validateContainerName,
  redactSecrets,
  redactEnvVars
} from './validator.js';

const execFileAsync = promisify(execFile);

// Connect to local Docker Engine via named pipe (Windows) or socket (Linux/Mac)
const dockerSocketPath = process.env.DOCKER_HOST?.startsWith('npipe://')
  ? undefined
  : (process.env.DOCKER_HOST?.replace('unix://', '') || '/var/run/docker.sock');

let docker: Dockerode;

try {
  if (process.platform === 'win32') {
    docker = new Dockerode({ socketPath: '//./pipe/docker_engine' });
  } else {
    docker = new Dockerode({ socketPath: dockerSocketPath || '/var/run/docker.sock' });
  }
} catch (err) {
  console.error('[DOCKER] Failed to create Docker client:', err);
  docker = new Dockerode(); // fallback — will fail gracefully on operations
}

// ─── docker_check_status ────────────────────────────────────────────────────
export async function checkDockerStatus(): Promise<Record<string, unknown>> {
  try {
    const version = await docker.version();
    const info = await docker.info();
    return {
      success: true,
      installed: true,
      engineRunning: true,
      version: version.Version,
      apiVersion: version.ApiVersion,
      os: version.Os,
      arch: version.Arch,
      containers: {
        total: info.Containers,
        running: info.ContainersRunning,
        paused: info.ContainersPaused,
        stopped: info.ContainersStopped
      },
      images: info.Images,
      runtime: info.DefaultRuntime || 'runc',
      serverVersion: info.ServerVersion
    };
  } catch (err) {
    const error = err as { message?: string; code?: string };
    const isNotInstalled = error.code === 'ENOENT' || error.message?.includes('Cannot connect');
    return {
      success: false,
      installed: !isNotInstalled,
      engineRunning: false,
      error: isNotInstalled
        ? 'Docker is not installed or not in PATH. Install Docker Desktop from https://www.docker.com/products/docker-desktop'
        : `Docker Engine is not running: ${error.message}. Start Docker Desktop and try again.`
    };
  }
}

// ─── docker_build_image ─────────────────────────────────────────────────────
export async function buildImage(params: {
  projectDir: string;
  dockerfilePath: string;
  imageName: string;
  buildArgs: Record<string, string>;
}): Promise<Record<string, unknown>> {
  const { projectDir, dockerfilePath, imageName, buildArgs } = params;

  // Validate
  const dirCheck = validateProjectDir(projectDir);
  if (!dirCheck.valid) return { success: false, error: dirCheck.error };

  const dfCheck = validateDockerfilePath(dirCheck.resolved, dockerfilePath);
  if (!dfCheck.valid) return { success: false, error: dfCheck.error };

  const imageCheck = validateImageName(imageName);
  if (!imageCheck.valid) return { success: false, error: imageCheck.error };

  console.log(`[DOCKER] Building image "${imageName}" from "${dirCheck.resolved}/${dockerfilePath}"`);

  try {
    const stream = await docker.buildImage(
      { context: dirCheck.resolved, src: [dockerfilePath] },
      {
        t: imageName,
        dockerfile: dockerfilePath,
        buildargs: buildArgs
      }
    );

    const output: string[] = [];
    let imageId = '';

    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        stream,
        (err: Error | null, result: Array<{ stream?: string; aux?: { ID?: string }; error?: string }>) => {
          if (err) { reject(err); return; }
          // Extract image ID from last aux message
          const auxMsg = result?.find(r => r.aux?.ID);
          if (auxMsg?.aux?.ID) imageId = auxMsg.aux.ID;
          resolve();
        },
        (event: { stream?: string; error?: string }) => {
          if (event.stream) output.push(event.stream.trim());
          if (event.error) output.push(`ERROR: ${event.error}`);
        }
      );
    });

    return {
      success: true,
      imageName,
      imageId: imageId || 'unknown',
      buildLog: output.slice(-20) // Last 20 lines to avoid flooding
    };
  } catch (err) {
    const error = err as { message?: string };
    return { success: false, error: `Build failed: ${error.message}` };
  }
}

// ─── docker_create_container ────────────────────────────────────────────────
export async function createContainer(params: {
  imageName: string;
  containerName: string;
  portMappings: string[];
  environmentVariables: Record<string, string>;
  volumeMappings: string[];
}): Promise<Record<string, unknown>> {
  const { imageName, containerName, portMappings, environmentVariables, volumeMappings } = params;

  const imageCheck = validateImageName(imageName);
  if (!imageCheck.valid) return { success: false, error: imageCheck.error };

  const nameCheck = validateContainerName(containerName);
  if (!nameCheck.valid) return { success: false, error: nameCheck.error };

  // Validate port mappings
  const parsedPorts: Record<string, Array<{ HostPort: string }>> = {};
  const exposedPorts: Record<string, Record<string, never>> = {};

  for (const mapping of portMappings) {
    const check = validatePortMapping(mapping);
    if (!check.valid) return { success: false, error: check.error };
    const key = `${check.containerPort}/tcp`;
    exposedPorts[key] = {};
    parsedPorts[key] = [{ HostPort: String(check.hostPort) }];
  }

  // Build env array (never log values)
  const envArray = Object.entries(environmentVariables).map(([k, v]) => `${k}=${v}`);

  try {
    const container = await docker.createContainer({
      name: containerName,
      Image: imageName,
      ExposedPorts: exposedPorts,
      Env: envArray,
      HostConfig: {
        PortBindings: parsedPorts,
        Binds: volumeMappings,
        RestartPolicy: { Name: 'unless-stopped' }
      }
    });

    return {
      success: true,
      containerId: container.id,
      containerName,
      imageName,
      ports: portMappings,
      message: `Container "${containerName}" created successfully. Start it with docker_start_container.`
    };
  } catch (err) {
    const error = err as { message?: string };
    return { success: false, error: `Failed to create container: ${error.message}` };
  }
}

// ─── docker_start_container ─────────────────────────────────────────────────
export async function startContainer(params: { containerNameOrId: string }): Promise<Record<string, unknown>> {
  try {
    const container = docker.getContainer(params.containerNameOrId);
    await container.start();
    const inspect = await container.inspect();
    return {
      success: true,
      containerName: inspect.Name.replace(/^\//, ''),
      containerId: inspect.Id.substring(0, 12),
      status: inspect.State.Status,
      running: inspect.State.Running,
      startedAt: inspect.State.StartedAt
    };
  } catch (err) {
    const error = err as { message?: string };
    return { success: false, error: `Failed to start container: ${error.message}` };
  }
}

// ─── docker_stop_container ──────────────────────────────────────────────────
export async function stopContainer(params: { containerNameOrId: string; timeoutSeconds: number }): Promise<Record<string, unknown>> {
  try {
    const container = docker.getContainer(params.containerNameOrId);
    await container.stop({ t: params.timeoutSeconds });
    const inspect = await container.inspect();
    return {
      success: true,
      containerName: inspect.Name.replace(/^\//, ''),
      containerId: inspect.Id.substring(0, 12),
      status: inspect.State.Status,
      finishedAt: inspect.State.FinishedAt
    };
  } catch (err) {
    const error = err as { message?: string };
    return { success: false, error: `Failed to stop container: ${error.message}` };
  }
}

// ─── docker_list_containers ─────────────────────────────────────────────────
export async function listContainers(params: { showAll: boolean }): Promise<Record<string, unknown>> {
  try {
    const containers = await docker.listContainers({ all: params.showAll });
    return {
      success: true,
      count: containers.length,
      containers: containers.map(c => ({
        id: c.Id.substring(0, 12),
        names: c.Names.map(n => n.replace(/^\//, '')),
        image: c.Image,
        status: c.Status,
        state: c.State,
        ports: c.Ports.map(p => p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`)
      }))
    };
  } catch (err) {
    const error = err as { message?: string };
    return { success: false, error: `Failed to list containers: ${error.message}` };
  }
}

// ─── docker_container_logs ──────────────────────────────────────────────────
export async function containerLogs(params: { containerNameOrId: string; tail: number; timestamps: boolean }): Promise<Record<string, unknown>> {
  try {
    const container = docker.getContainer(params.containerNameOrId);
    const logsBuffer = await container.logs({
      stdout: true,
      stderr: true,
      tail: params.tail,
      timestamps: params.timestamps
    });

    // Convert buffer to string and redact secrets
    const rawLogs = logsBuffer.toString('utf8');
    const redactedLogs = redactSecrets(rawLogs);

    return {
      success: true,
      containerNameOrId: params.containerNameOrId,
      linesRequested: params.tail,
      logs: redactedLogs,
      note: 'Sensitive values have been redacted from logs.'
    };
  } catch (err) {
    const error = err as { message?: string };
    return { success: false, error: `Failed to get logs: ${error.message}` };
  }
}

// ─── docker_remove_container ────────────────────────────────────────────────
export async function removeContainer(params: { containerNameOrId: string; force: boolean }): Promise<Record<string, unknown>> {
  try {
    const container = docker.getContainer(params.containerNameOrId);
    await container.remove({ force: params.force });
    return {
      success: true,
      message: `Container "${params.containerNameOrId}" removed successfully.`
    };
  } catch (err) {
    const error = err as { message?: string };
    return { success: false, error: `Failed to remove container: ${error.message}` };
  }
}

// ─── docker_inspect_container ───────────────────────────────────────────────
export async function inspectContainer(params: { containerNameOrId: string }): Promise<Record<string, unknown>> {
  try {
    const container = docker.getContainer(params.containerNameOrId);
    const info = await container.inspect();

    // Redact environment variable values
    const rawEnv: string[] = info.Config?.Env || [];
    const envRecord: Record<string, string> = {};
    rawEnv.forEach(e => {
      const [k, ...rest] = e.split('=');
      envRecord[k] = rest.join('=');
    });
    const safeEnv = redactEnvVars(envRecord);

    return {
      success: true,
      name: info.Name.replace(/^\//, ''),
      id: info.Id.substring(0, 12),
      image: info.Config?.Image,
      status: info.State?.Status,
      running: info.State?.Running,
      startedAt: info.State?.StartedAt,
      finishedAt: info.State?.FinishedAt,
      ports: info.NetworkSettings?.Ports,
      network: Object.keys(info.NetworkSettings?.Networks || {}),
      mounts: info.Mounts?.map(m => ({ type: m.Type, source: m.Source, destination: m.Destination })),
      environmentVariables: safeEnv,
      restartPolicy: info.HostConfig?.RestartPolicy
    };
  } catch (err) {
    const error = err as { message?: string };
    return { success: false, error: `Failed to inspect container: ${error.message}` };
  }
}

// ─── docker_compose_up ──────────────────────────────────────────────────────
export async function composeUp(params: {
  projectDir: string;
  composeFile: string;
  detached: boolean;
  buildFirst: boolean;
}): Promise<Record<string, unknown>> {
  const { projectDir, composeFile, detached, buildFirst } = params;

  const dirCheck = validateProjectDir(projectDir);
  if (!dirCheck.valid) return { success: false, error: dirCheck.error };

  const composePath = path.join(dirCheck.resolved, composeFile);
  if (!fs.existsSync(composePath)) {
    return { success: false, error: `Compose file not found: "${composePath}"` };
  }

  console.log(`[DOCKER] compose up in "${dirCheck.resolved}" with file "${composeFile}"`);

  try {
    const args = ['compose', '-f', composeFile, 'up'];
    if (detached) args.push('-d');
    if (buildFirst) args.push('--build');

    const { stdout, stderr } = await execFileAsync('docker', args, {
      cwd: dirCheck.resolved,
      timeout: 300000 // 5 minutes
    });

    const output = (stdout + stderr).trim();
    return {
      success: true,
      projectDir: dirCheck.resolved,
      composeFile,
      output: redactSecrets(output).split('\n').slice(-30),
      message: 'Services started successfully. Check docker_list_containers for status.'
    };
  } catch (err) {
    const error = err as { message?: string; stderr?: string; stdout?: string };
    const output = redactSecrets((error.stdout || '') + (error.stderr || ''));
    return {
      success: false,
      error: `compose up failed: ${error.message}`,
      output: output.split('\n').slice(-20)
    };
  }
}

// ─── docker_compose_down ────────────────────────────────────────────────────
export async function composeDown(params: {
  projectDir: string;
  composeFile: string;
  removeVolumes: boolean;
}): Promise<Record<string, unknown>> {
  const { projectDir, composeFile, removeVolumes } = params;

  const dirCheck = validateProjectDir(projectDir);
  if (!dirCheck.valid) return { success: false, error: dirCheck.error };

  const composePath = path.join(dirCheck.resolved, composeFile);
  if (!fs.existsSync(composePath)) {
    return { success: false, error: `Compose file not found: "${composePath}"` };
  }

  console.log(`[DOCKER] compose down in "${dirCheck.resolved}" — removeVolumes: ${removeVolumes}`);

  try {
    const args = ['compose', '-f', composeFile, 'down'];
    if (removeVolumes) args.push('-v');

    const { stdout, stderr } = await execFileAsync('docker', args, {
      cwd: dirCheck.resolved,
      timeout: 120000
    });

    const output = (stdout + stderr).trim();
    return {
      success: true,
      projectDir: dirCheck.resolved,
      composeFile,
      volumesRemoved: removeVolumes,
      output: redactSecrets(output).split('\n'),
      message: removeVolumes ? 'Services stopped and volumes removed.' : 'Services stopped. Data volumes preserved.'
    };
  } catch (err) {
    const error = err as { message?: string; stderr?: string; stdout?: string };
    return {
      success: false,
      error: `compose down failed: ${error.message}`,
      output: redactSecrets((error.stdout || '') + (error.stderr || '')).split('\n').slice(-10)
    };
  }
}
