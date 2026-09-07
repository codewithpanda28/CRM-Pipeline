import { redirect } from 'next/navigation';

/** Legacy CRM tasks list — Round B primary surface is Ops My Tasks. */
export default function CrmTasksRedirectPage() {
  redirect('/ops/tasks');
}
