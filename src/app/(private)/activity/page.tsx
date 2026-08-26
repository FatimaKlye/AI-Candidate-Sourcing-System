import { requireHrContext } from "@/lib/hr/context";

export default async function ActivityPage() {
  const { supabase, workspace } = await requireHrContext();
  const { data: activity } = await supabase.from("activity_logs").select("id, actor_id, event_type, entity_type, entity_id, metadata, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(200);
  const actorIds = [...new Set((activity ?? []).map((item) => item.actor_id).filter((id): id is string => Boolean(id)))];
  const { data: profiles } = actorIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || profile.email || "HR user"]));
  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Activity</h1><p className="mt-2 text-sm text-slate-500">An immutable record of important HR actions across the workspace.</p></div><div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{(activity ?? []).map((item) => <div key={item.id} className="flex gap-4 px-5 py-4"><div className="mt-1 h-9 w-9 shrink-0 rounded-full bg-cyan-100 text-center text-sm font-semibold leading-9 text-cyan-800">{(names.get(item.actor_id ?? "") || "S")[0]}</div><div className="min-w-0"><p className="text-sm text-slate-700"><span className="font-semibold text-slate-900">{item.actor_id ? names.get(item.actor_id) || "HR user" : "System"}</span> · <span className="capitalize">{item.event_type.replaceAll("_", " ")}</span></p><p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString()} · {item.entity_type}</p></div></div>)}{activity?.length === 0 && <p className="px-5 py-14 text-center text-sm text-slate-500">No recorded activity yet.</p>}</div></div></div>;
}
