import { NewSearchWizard } from "@/components/search/NewSearchWizard";

export default function NewRequisitionPage() {
  return <div className="mx-auto max-w-3xl space-y-6"><div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Create job requisition</h1><p className="mt-2 text-sm text-slate-500">Upload or paste the approved job description, then add the hiring details.</p></div><NewSearchWizard /></div>;
}
