/**
 * Kin Status API Routes
 * 
 * Endpoints for Kin companion status retrieval.
 */

import express, { Request, Response } from 'express';

const router = express.Router();

interface KinStatusRecord {
  record_id: string;
  schema_family: 'kin_status_record';
  kin_id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'offline';
  last_seen: string;
  glb_url: string;
  specialization: string;
  owner_consent_flags: {
    data_collection: boolean;
    voice_recording: boolean;
    research_access: boolean;
  };
  support_safe_summary: string;
}

/**
 * Get status for all Kin companions
 * GET /api/kin/status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // In development, return mock data
    if (process.env.NODE_ENV === 'development') {
      const mockData = getMockKinStatus();
      return res.json(mockData);
    }

    // In production, this would query the Python runtime types
    const kinStatus = await fetchKinStatus();
    res.json(kinStatus);
  } catch (error) {
    console.error('Error fetching Kin status:', error);
    res.status(500).json({ error: 'Failed to fetch Kin status' });
  }
});

/**
 * Get status for a specific Kin
 * GET /api/kin/status/:kinId
 */
router.get('/status/:kinId', async (req: Request, res: Response) => {
  try {
    const { kinId } = req.params;

    // In development, return mock data
    if (process.env.NODE_ENV === 'development') {
      const mockData = getMockKinStatus();
      const kin = mockData.find(k => k.kin_id === kinId);
      
      if (!kin) {
        return res.status(404).json({ error: `Kin ${kinId} not found` });
      }
      
      return res.json(kin);
    }

    const kinStatus = await fetchKinStatusById(kinId);
    res.json(kinStatus);
  } catch (error) {
    console.error('Error fetching Kin status:', error);
    res.status(500).json({ error: 'Failed to fetch Kin status' });
  }
});

// --- Helper functions for mock data ---

function getMockKinStatus(): KinStatusRecord[] {
  const now = new Date();
  
  return [
    {
      record_id: 'kin-status-cipher001',
      schema_family: 'kin_status_record',
      kin_id: 'cipher-001',
      name: 'Cipher',
      status: 'healthy',
      last_seen: now.toISOString(),
      glb_url: 'https://assets.kr8tiv.ai/kin/cipher.glb',
      specialization: 'web-design',
      owner_consent_flags: {
        data_collection: true,
        voice_recording: true,
        research_access: false,
      },
      support_safe_summary: 'Cipher is actively serving and ready for website tasks.',
    },
    {
      record_id: 'kin-status-mischief001',
      schema_family: 'kin_status_record',
      kin_id: 'mischief-001',
      name: 'Mischief',
      status: 'healthy',
      last_seen: new Date(now.getTime() - 300000).toISOString(),
      glb_url: 'https://assets.kr8tiv.ai/kin/mischief.glb',
      specialization: 'family-companion',
      owner_consent_flags: {
        data_collection: true,
        voice_recording: false,
        research_access: false,
      },
      support_safe_summary: 'Mischief is playful and ready for family activities.',
    },
    {
      record_id: 'kin-status-vortex001',
      schema_family: 'kin_status_record',
      kin_id: 'vortex-001',
      name: 'Vortex',
      status: 'degraded',
      last_seen: new Date(now.getTime() - 3600000).toISOString(),
      glb_url: 'https://assets.kr8tiv.ai/kin/vortex.glb',
      specialization: 'social-media',
      owner_consent_flags: {
        data_collection: false,
        voice_recording: false,
        research_access: true,
      },
      support_safe_summary: 'Vortex is experiencing intermittent connectivity.',
    },
  ];
}

// --- Production stubs ---

async function fetchKinStatus(): Promise<KinStatusRecord[]> {
  // TODO: Query Python runtime types
  return [];
}

async function fetchKinStatusById(kinId: string): Promise<KinStatusRecord | null> {
  // TODO: Query Python runtime types
  return null;
}

export default router;
