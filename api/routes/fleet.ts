import { FastifyPluginAsync } from 'fastify';

interface FleetInstance {
  id: string;
  service: string;
  status: 'healthy' | 'degraded' | 'offline';
  lastSeen: number;
  cpuUsage: number;
  memoryUsage: number;
  requestCount: number;
  errorCount: number;
}

interface FleetStatus {
  totalInstances: number;
  healthy: number;
  degraded: number;
  offline: number;
  instances: FleetInstance[];
  lastUpdated: number;
}

class FleetMonitor {
  private instances: Map<string, FleetInstance> = new Map();
  private updateInterval?: NodeJS.Timeout;

  registerInstance(id: string, service: string): void {
    this.instances.set(id, {
      id,
      service,
      status: 'healthy',
      lastSeen: Date.now(),
      cpuUsage: 0,
      memoryUsage: 0,
      requestCount: 0,
      errorCount: 0,
    });
  }

  updateHeartbeat(id: string, metrics: Partial<FleetInstance>): void {
    const instance = this.instances.get(id);
    if (instance) {
      Object.assign(instance, metrics, { lastSeen: Date.now() });
      
      if (instance.errorCount > 10) {
        instance.status = 'degraded';
      }
      if (Date.now() - instance.lastSeen > 60000) {
        instance.status = 'offline';
      }
    }
  }

  recordRequest(id: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.requestCount++;
    }
  }

  recordError(id: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.errorCount++;
      if (instance.errorCount > 5) {
        instance.status = 'degraded';
      }
    }
  }

  getStatus(): FleetStatus {
    let healthy = 0, degraded = 0, offline = 0;

    for (const instance of this.instances.values()) {
      if (instance.status === 'healthy') healthy++;
      else if (instance.status === 'degraded') degraded++;
      else offline++;
    }

    return {
      totalInstances: this.instances.size,
      healthy,
      degraded,
      offline,
      instances: Array.from(this.instances.values()),
      lastUpdated: Date.now(),
    };
  }

  getAlerts(): Array<{ severity: string; message: string; instanceId?: string }> {
    const alerts: Array<{ severity: string; message: string; instanceId?: string }> = [];

    for (const instance of this.instances.values()) {
      if (instance.status === 'offline') {
        alerts.push({
          severity: 'critical',
          message: `Instance ${instance.id} (${instance.service}) is offline`,
          instanceId: instance.id,
        });
      } else if (instance.status === 'degraded') {
        alerts.push({
          severity: 'warning',
          message: `Instance ${instance.id} (${instance.service}) is degraded - ${instance.errorCount} errors`,
          instanceId: instance.id,
        });
      }

      if (instance.memoryUsage > 90) {
        alerts.push({
          severity: 'warning',
          message: `Instance ${instance.id} (${instance.service}) high memory: ${instance.memoryUsage}%`,
          instanceId: instance.id,
        });
      }

      if (instance.cpuUsage > 90) {
        alerts.push({
          severity: 'warning',
          message: `Instance ${instance.id} (${instance.service}) high CPU: ${instance.cpuUsage}%`,
          instanceId: instance.id,
        });
      }
    }

    return alerts;
  }
}

let fleetMonitor: FleetMonitor | null = null;

function getFleetMonitor(): FleetMonitor {
  if (!fleetMonitor) {
    fleetMonitor = new FleetMonitor();
  }
  return fleetMonitor;
}

const fleetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/fleet/status', async (request) => {
    const monitor = getFleetMonitor();
    return monitor.getStatus();
  });

  fastify.get('/fleet/alerts', async (request) => {
    const monitor = getFleetMonitor();
    return monitor.getAlerts();
  });

  fastify.post('/fleet/heartbeat', async (request, reply) => {
    const userId = (request.user as { userId: string }).userId;
    const body = request.body as {
      instanceId: string;
      service: string;
      cpuUsage?: number;
      memoryUsage?: number;
    };

    const monitor = getFleetMonitor();
    
    if (!body.instanceId) {
      reply.status(400);
      return { error: 'instanceId required' };
    }

    const existing = Array.from(monitor.getStatus().instances).find(
      i => i.id === body.instanceId
    );

    if (!existing) {
      monitor.registerInstance(body.instanceId, body.service);
    }

    monitor.updateHeartbeat(body.instanceId, {
      cpuUsage: body.cpuUsage,
      memoryUsage: body.memoryUsage,
    });

    return { success: true };
  });

  fastify.post('/fleet/metrics', async (request, reply) => {
    const body = request.body as {
      instanceId: string;
      requestCount?: number;
      errorCount?: number;
    };

    if (!body.instanceId) {
      reply.status(400);
      return { error: 'instanceId required' };
    }

    const monitor = getFleetMonitor();
    monitor.updateHeartbeat(body.instanceId, {
      requestCount: body.requestCount,
      errorCount: body.errorCount,
    });

    return { success: true };
  });
};

export default fleetRoutes;
