/**
 * Website Module - AI-powered website generation for KIN
 *
 * This module provides complete website building with:
 * - AI code generation
 * - Design reference system
 * - Quality validation
 * - Preview and deployment
 * - Teaching mode
 *
 * @example
 * ```typescript
 * import { WebsitePipeline, getDesignReferences } from './website';
 *
 * const pipeline = new WebsitePipeline();
 *
 * // Generate from prompt
 * const result = await pipeline.generate(
 *   { prompt: "Create a landing page for a SaaS product", teachingMode: true },
 *   llmClient
 * );
 *
 * // Get design inspiration
 * const refs = pipeline.getDesignReferences('dark minimal');
 *
 * // Deploy
 * const { url } = await pipeline.deploy(result.files);
 * ```
 *
 * @module website
 */

export {
  WebsitePipeline,
  generateWebsite,
  startPreview,
  deploy,
  type WebsiteConfig,
  type WebsiteRequest,
  type GeneratedFile,
  type GenerationResult,
  type DesignReference,
  type QualityCheck,
} from './pipeline';
