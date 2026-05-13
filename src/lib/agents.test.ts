import { describe, expect, it } from "vitest";
import { canAgentReadKnowledge, canAgentUseProjectFolder, defaultAgentTasks, defaultAgents, summarizeAgentTask } from "./agents";

describe("agent catalog", () => {
  it("provides the four default ClawDesk agents", () => {
    expect(defaultAgents.map((agent) => agent.name)).toEqual(["個人助理", "文書助理", "自動化助理", "研究助理"]);
  });

  it("keeps knowledge isolated unless shared or in shared scope", () => {
    const personal = defaultAgents[0];
    const docs = defaultAgents[1];
    const research = defaultAgents[3];
    const privateItem = { id: "k1", agentId: docs.id, title: "文件格式", shared: false };
    const sharedItem = { ...privateItem, shared: true };

    expect(canAgentReadKnowledge(personal, privateItem)).toBe(false);
    expect(canAgentReadKnowledge(personal, sharedItem)).toBe(true);
    expect(canAgentReadKnowledge(research, privateItem)).toBe(true);
  });

  it("keeps configurable model providers and allowed folders per agent", () => {
    const docs = defaultAgents[1];

    expect(docs.modelProvider).toBe("chatgpt-pro");
    expect(canAgentUseProjectFolder(docs, "~/ClawDesk/projects/docs-brief/")).toBe(true);
    expect(canAgentUseProjectFolder(docs, "~/ClawDesk/projects/other")).toBe(false);
  });

  it("summarizes the simplified orchestrator task board", () => {
    expect(defaultAgentTasks.map((task) => task.status)).toContain("waiting-approval");
    expect(summarizeAgentTask(defaultAgentTasks[0])).toContain("2 個 Agent");
  });
});
