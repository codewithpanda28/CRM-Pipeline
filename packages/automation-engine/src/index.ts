export { sha256Canonical, canonicalizeJson, schemaHashForGraph } from './hash';
export {
  getActionDefinition,
  getActionClass,
  assertPublishableAction,
  listActions,
  type ActionClass,
  type ActionDefinition,
} from './actions/registry';
export { executeClassAAction, executeCriticalStub } from './actions/execute';
export {
  AutomationApprovalService,
  type CreateApprovalInput,
  type ValidateExecutionResult,
} from './approval/service';
export { WorkflowDefinitionService, type WorkflowGraph } from './definition/service';
export { TriggerMatcher } from './trigger/matcher';
export {
  RunAdvanceExecutor,
  pauseRun,
  resumeRun,
  replayRun,
} from './runtime/advance';
export {
  loadEngineV2Flags,
  setEngineV2Flags,
  type EngineV2Flags,
} from './flags';
export {
  normalizeEnvelope,
  type AutomationEventEnvelope,
  type EnvelopeActorType,
  type EnvelopeSourceSystem,
} from './envelope';
export { incrementUsage, type UsageCounterName } from './usage';
