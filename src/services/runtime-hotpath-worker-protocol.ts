import type { SerializableCompiledProgramIR } from './compile-worker-protocol';

export type RuntimeExternalWrite =
  | { readonly op: 'set'; readonly name: string; readonly v: number }
  | { readonly op: 'pulse'; readonly name: string }
  | { readonly op: 'add'; readonly name: string; readonly dv: number };

export type RuntimeHotpathWorkerInboundMessage =
  | {
      readonly type: 'BOOTSTRAP';
      readonly sharedInput: SharedArrayBuffer;
      readonly sharedShapeBank: SharedArrayBuffer;
      readonly sharedSinkTable: SharedArrayBuffer;
      readonly tickHz?: number;
    }
  | {
      readonly type: 'INSTALL_PROGRAM';
      readonly program: SerializableCompiledProgramIR;
    }
  | {
      readonly type: 'SET_VIEWPORT';
      readonly width: number;
      readonly height: number;
      readonly zoom: number;
      readonly panX: number;
      readonly panY: number;
    }
  | {
      readonly type: 'EXTERNAL_WRITES';
      readonly writes: readonly RuntimeExternalWrite[];
    }
  | {
      readonly type: 'PAUSE';
    }
  | {
      readonly type: 'RESUME';
    }
  | {
      readonly type: 'SHUTDOWN';
    };

export type RuntimeHotpathWorkerOutboundMessage =
  | {
      readonly type: 'BOOTSTRAP_SUCCESS';
    }
  | {
      readonly type: 'PROGRAM_INSTALLED';
      readonly sinkCount: number;
    }
  | {
      readonly type: 'HEARTBEAT';
      readonly frameCount: number;
      readonly meanTickMs: number;
      readonly lastTickMs: number;
      readonly drawOpCount: number;
      readonly sinkWordCount: number;
    }
  | {
      readonly type: 'FATAL';
      readonly code: string;
      readonly message: string;
    };
