/**
 * KinStatusRecord - Schema for Kin status in Mission Control
 * 
 * Uses snake_case to match API response format and kin-status-record.schema.json
 */
export interface KinStatusRecord {
  record_id: string;
  schema_family: 'kin_status_record';
  kin_id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'offline';
  last_seen: string; // ISO 8601
  glb_url: string;
  specialization: string;
  owner_consent_flags: {
    data_collection?: boolean;
    voice_recording?: boolean;
    research_access?: boolean;
  };
  support_safe_summary?: string;
  created_at?: string;
  updated_at?: string;
  schema_version?: string;
}

export default KinStatusRecord;
