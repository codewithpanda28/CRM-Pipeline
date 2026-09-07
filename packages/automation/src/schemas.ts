import { z } from 'zod';

export type PMEvent =
  | { type: 'task_status_changed'; projectId: string; taskId: string; to_status_id: string }
  | { type: 'task_overdue'; projectId: string; taskId: string }
  | { type: 'task_assigned'; projectId: string; taskId: string; userId: string }
  | { type: 'milestone_completed'; projectId: string; milestoneId: string }
  | { type: 'client_approved'; projectId: string; approvalId: string }
  | { type: 'client_rejected'; projectId: string; approvalId: string }
  | { type: 'sprint_started'; projectId: string; sprintId: string }
  | { type: 'sprint_ended'; projectId: string; sprintId: string };

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('task_status_changed'), to_status_id: z.string().uuid().optional() }),
  z.object({ type: z.literal('task_overdue') }),
  z.object({ type: z.literal('task_assigned') }),
  z.object({ type: z.literal('milestone_completed') }),
  z.object({ type: z.literal('client_approved') }),
  z.object({ type: z.literal('client_rejected') }),
  z.object({ type: z.literal('sprint_started') }),
  z.object({ type: z.literal('sprint_ended') }),
]);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send_notification'),
    user_ids: z.array(z.string().uuid()),
    message: z.string(),
  }),
  z.object({ type: z.literal('change_task_status'), status_id: z.string().uuid() }),
  z.object({ type: z.literal('assign_task'), user_id: z.string().uuid() }),
  z.object({ type: z.literal('mark_milestone_complete'), milestone_id: z.string().uuid() }),
  z.object({
    type: z.literal('send_webhook'),
    url: z.string().url(),
    payload: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('create_task'),
    title: z.string().min(1).max(500),
    status_id: z.string().uuid().optional(),
    assignee_ids: z.array(z.string().uuid()).optional(),
  }),
  z.object({
    type: z.literal('set_custom_field'),
    custom_field_id: z.string().uuid(),
    value: z.string(),
  }),
]);

export type ParsedTrigger = z.infer<typeof triggerSchema>;
export type ParsedAction = z.infer<typeof actionSchema>;
