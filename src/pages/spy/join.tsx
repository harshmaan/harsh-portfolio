---
import JoinSpyGame from "../../components/JoinSpyGame.tsx";
import BasicLayout from "../../layouts/BasicLayout.astro";
---

<BasicLayout title="Spy Among Prompts" description="A hidden role game powered by LLMs">
  <JoinSpyGame client:load />
</BasicLayout>
