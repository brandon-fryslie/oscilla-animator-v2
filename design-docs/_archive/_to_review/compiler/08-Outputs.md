
11) Outputs / render pipeline contract

export interface OutputSpec {
  id: string;
  kind: "renderTree" | "renderCmds";

  // slot that holds the final product
  slot: ValueSlot;

  // output meta (e.g. preview)
  meta?: { label?: string };
}

Render is produced by render-capability nodes. The final output slot must be one of the above kinds.

⸻