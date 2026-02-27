export type AsyncCompilerState =
  | 'idle'
  | 'dirty'
  | 'compiling'
  | 'linking'
  | 'ready'
  | 'error';
