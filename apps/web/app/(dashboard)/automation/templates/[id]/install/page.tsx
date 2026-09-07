import { TemplateInstallPage } from '@/modules/automation/pages/templates';

export default function InstallTemplateRoute({ params }: { params: { id: string } }) {
  return <TemplateInstallPage templateId={params.id} />;
}
