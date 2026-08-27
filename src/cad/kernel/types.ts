import type { CadDocument, Evaluation } from "../types";
import type { ExportResult, HelloResult, InspectResult, ValidateResult } from "./protocol";

/** Open identifier: new backends register without editing this union (ADR-0004). */
export type KernelId = string;

export interface KernelStatus {
  kernel?: string;
  id: KernelId;
  name: string;
  available: boolean;
  headless?: boolean;
  version?: string;
  python?: string;
  executable?: string;
  modules?: Record<string, boolean>;
  pid?: number;
  detail?: string;
}

export interface ExportOptions {
  format: "stl" | "obj" | "json" | "step" | "fcstd" | "3mf";
  bodyId?: string;
  projectSlug?: string;
  revisionId?: string;
}

export interface KernelExport extends ExportResult {
  text?: string;
  base64?: string;
  filename: string;
  revision?: string | null;
  validation?: ValidateResult | null;
  success: boolean;
}

export interface CadKernel {
  readonly id: KernelId;
  readonly name: string;
  available(): Promise<KernelStatus>;
  evaluate(doc: CadDocument): Promise<Evaluation>;
  inspect(doc: CadDocument): Promise<InspectResult>;
  validate(doc: CadDocument): Promise<ValidateResult>;
  exportModel(doc: CadDocument, options: ExportOptions): Promise<KernelExport>;
}

export type { HelloResult, InspectResult, ValidateResult, ExportResult };
