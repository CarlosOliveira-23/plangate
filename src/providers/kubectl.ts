import { readFileSync, existsSync } from "node:fs";
import yaml from "js-yaml";
import { run } from "../exec.js";
import { tokenize, getFlagValue, getFlagList } from "../argParse.js";
import type { PlanResult, ResourceChange } from "../types.js";

const KIND_ALIASES: Record<string, string> = {
  po: "Pod",
  pod: "Pod",
  pods: "Pod",
  svc: "Service",
  service: "Service",
  services: "Service",
  deploy: "Deployment",
  deployment: "Deployment",
  deployments: "Deployment",
  sts: "StatefulSet",
  statefulset: "StatefulSet",
  statefulsets: "StatefulSet",
  pvc: "PersistentVolumeClaim",
  persistentvolumeclaim: "PersistentVolumeClaim",
  persistentvolumeclaims: "PersistentVolumeClaim",
  pv: "PersistentVolume",
  persistentvolume: "PersistentVolume",
  persistentvolumes: "PersistentVolume",
  ns: "Namespace",
  namespace: "Namespace",
  namespaces: "Namespace",
  secret: "Secret",
  secrets: "Secret",
  cm: "ConfigMap",
  configmap: "ConfigMap",
  configmaps: "ConfigMap"
};

function normalizeKind(kind: string): string {
  const lower = kind.toLowerCase();
  return KIND_ALIASES[lower] ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/s$/, "");
}

export function isKubectlDestructive(command: string): boolean {
  return /\bkubectl\b[^|&;]*\bdelete\b/.test(command) || /\bkubectl\b[^|&;]*\bapply\b[^|&;]*--prune\b/.test(command);
}

interface K8sManifest {
  kind?: string;
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
}

function manifestToChange(doc: K8sManifest): ResourceChange | undefined {
  if (!doc?.kind) return undefined;
  const namespace = doc.metadata?.namespace ? `${doc.metadata.namespace}/` : "";
  return {
    provider: "kubernetes",
    resourceType: doc.kind,
    address: `${namespace}${doc.metadata?.name ?? "(unnamed)"}`,
    action: "delete",
    tags: doc.metadata?.labels ?? {}
  };
}

function fromManifestFiles(files: string[], cwd: string): ResourceChange[] {
  const changes: ResourceChange[] = [];
  for (const file of files) {
    const path = file.startsWith("/") ? file : `${cwd}/${file}`;
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    const docs = yaml.loadAll(content) as K8sManifest[];
    for (const doc of docs) {
      const change = manifestToChange(doc);
      if (change) changes.push(change);
    }
  }
  return changes;
}

function liveResourceLabels(kind: string, name: string, namespace: string | undefined, cwd: string): Record<string, string> {
  const args = ["get", kind, name, "-o", "json"];
  if (namespace) args.push("-n", namespace);
  const result = run("kubectl", args, cwd);
  if (result.status !== 0) return {};
  try {
    const parsed = JSON.parse(result.stdout) as K8sManifest;
    return parsed.metadata?.labels ?? {};
  } catch {
    return {};
  }
}

/**
 * `kubectl delete` has no plan equivalent, so we read back what's
 * actually there (from the target manifest, or the live object) to judge
 * blast radius -- the same "never trust the command text" rule as the
 * other providers.
 */
export function getKubectlPlan(command: string, cwd: string): PlanResult {
  if (/--prune\b/.test(command)) {
    return {
      provider: "kubernetes",
      changes: [],
      degraded: true,
      note: "`kubectl apply --prune` can delete resources PlanGate cannot enumerate ahead of time. Refusing to auto-approve."
    };
  }

  const tokens = tokenize(command);
  const files = getFlagList(tokens, "-f").length > 0 ? getFlagList(tokens, "-f") : getFlagList(tokens, "--filename");

  if (files.length > 0) {
    return { provider: "kubernetes", changes: fromManifestFiles(files, cwd), degraded: false };
  }

  // `kubectl delete <kind> <name> [-n ns]`
  const deleteIdx = tokens.indexOf("delete");
  const positional = tokens.slice(deleteIdx + 1).filter((t) => !t.startsWith("-"));
  const [kind, name] = positional;
  if (!kind || !name) {
    return {
      provider: "kubernetes",
      changes: [],
      degraded: true,
      note: "Could not identify the target resource(s) for this kubectl delete. Refusing to auto-approve."
    };
  }

  const namespace = getFlagValue(tokens, ["-n", "--namespace"]);
  const labels = liveResourceLabels(kind, name, namespace, cwd);

  const change: ResourceChange = {
    provider: "kubernetes",
    resourceType: normalizeKind(kind),
    address: `${namespace ? `${namespace}/` : ""}${name}`,
    action: "delete",
    tags: labels
  };

  return { provider: "kubernetes", changes: [change], degraded: false };
}
