import TaskBoard from "@/components/TaskBoard";
import { PageHeader, Screen } from "@/components/ui";

export default function DelegationPage() {
  return (
    <Screen
      header={
        <PageHeader
          eyebrow="Orchestration"
          title="Delegation Loop"
          sub="Hermes-style two-hop delegation: propose a contract → the target's model accepts or declines → the hub runs it for real → the target reports the outcome. All state is live from tasks.json; nothing here is simulated."
          accent="var(--color-signal)"
        />
      }
    >
      <TaskBoard />
    </Screen>
  );
}
