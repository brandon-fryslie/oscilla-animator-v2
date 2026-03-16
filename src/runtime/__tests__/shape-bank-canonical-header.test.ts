/**
 * Guardrail tests for ShapeHeaderV1 canonical header contract.
 *
 * // [LAW:one-source-of-truth] ShapeHeaderV1 word 4 (`indexCount`) is
 * // canonical topology metadata. Words 5-6 and 8 (`firstIndex`, `baseVertex`,
 * // `firstVertex`) remain realized geometry-offset fields that JS leaves as
 * // zero until a later realization boundary owns them.
 *
 * // [LAW:behavior-not-structure] These tests assert the canonical contract
 * // (realized-offset words are zero after materialization), not implementation
 * // details of how the header is written.
 */
import { describe, it, expect } from 'vitest';
import {
  SHAPE_BANK_HEADER_WORDS,
  SHAPE_BANK_REALIZED_GEOMETRY_WORDS,
  ShapeBankHeaderWord,
  allocShapeBankWords,
  createShapeBankHeaderV1,
  readShapeBankHeader,
  writeShapeBankHeader,
  createRuntimeState,
} from '../RuntimeState';
import { ShapeClass, TopologyMode } from '../../shapes/types';

describe('ShapeHeaderV1 canonical header contract', () => {
  it('realized geometry-offset words are zero after canonical header write', () => {
    const state = createRuntimeState(0, 0, 0, 0, 64, 0);
    const handle = allocShapeBankWords(state.shapeBank!, SHAPE_BANK_HEADER_WORDS);

    // Write a canonical header with only declarative fields set.
    // Do NOT set firstIndex, firstVertex, baseVertex — they are not canonical.
    writeShapeBankHeader(
      state.shapeBank!.data,
      handle,
      createShapeBankHeaderV1({
        kind: ShapeClass.Type1Rigid,
        topologyMode: TopologyMode.Path,
        flags: 1,
        vertexCount: 6,
        paramBlockOffset: 0,
        paramBlockWords: 0,
      }),
    );

    const header = readShapeBankHeader(state.shapeBank!.data, handle);

    // Canonical declarative fields are set correctly.
    expect(header.kind).toBe(ShapeClass.Type1Rigid);
    expect(header.topologyMode).toBe(TopologyMode.Path);
    expect(header.flags).toBe(1);
    expect(header.vertexCount).toBe(6);

    // Realized geometry-offset fields remain zero (not canonical).
    expect(header.firstIndex).toBe(0);
    expect(header.firstVertex).toBe(0);
    expect(header.baseVertex).toBe(0);
    // indexCount defaults to zero when not explicitly set.
    expect(header.indexCount).toBe(0);
  });

  it('SHAPE_BANK_REALIZED_GEOMETRY_WORDS lists exactly the non-canonical word offsets', () => {
    expect(SHAPE_BANK_REALIZED_GEOMETRY_WORDS).toEqual([
      ShapeBankHeaderWord.FirstIndex,   // word 5
      ShapeBankHeaderWord.BaseVertex,   // word 6
      ShapeBankHeaderWord.FirstVertex,  // word 8
    ]);
  });

  it('ValueExprMaterializer-style write produces zero realized-offset words', () => {
    // Simulates the write pattern used by evaluateShapeRefHandle() in
    // ValueExprMaterializer.ts — the canonical materialization path.
    const state = createRuntimeState(0, 0, 0, 0, 128, 0);
    const paramBlockWords = 12; // 6 vertices * 2 words each
    const handle = allocShapeBankWords(
      state.shapeBank!,
      SHAPE_BANK_HEADER_WORDS + paramBlockWords,
    );
    const paramBlockOffset = handle + SHAPE_BANK_HEADER_WORDS;

    writeShapeBankHeader(
      state.shapeBank!.data,
      handle,
      createShapeBankHeaderV1({
        kind: ShapeClass.Type1Rigid,
        topologyMode: TopologyMode.Path,
        flags: 1,
        indexCount: 12, // pre-computed: (6-2)*3
        vertexCount: 6,
        paramBlockOffset,
        paramBlockWords,
      }),
    );

    // Verify raw u32 words at realized-offset positions are zero.
    const data = state.shapeBank!.data;
    for (const wordOffset of SHAPE_BANK_REALIZED_GEOMETRY_WORDS) {
      expect(
        data[handle + wordOffset],
        `realized geometry word at offset ${wordOffset} should be zero in JS-side ShapeBank`,
      ).toBe(0);
    }

    // firstIndex, firstVertex, baseVertex are all zero.
    const header = readShapeBankHeader(data, handle);
    expect(header.firstIndex).toBe(0);
    expect(header.firstVertex).toBe(0);
    expect(header.baseVertex).toBe(0);
    // indexCount IS set (it's a canonical pre-computed topology value).
    expect(header.indexCount).toBe(12);
  });

  it('ShapeClass enum value is stored in ShapeBankHeaderWord.Kind', () => {
    const state = createRuntimeState(0, 0, 0, 0, 64, 0);
    const handle = allocShapeBankWords(state.shapeBank!, SHAPE_BANK_HEADER_WORDS);
    writeShapeBankHeader(
      state.shapeBank!.data,
      handle,
      createShapeBankHeaderV1({
        kind: ShapeClass.Type1Rigid,
        topologyMode: TopologyMode.Path,
        flags: 0,
        vertexCount: 3,
        paramBlockOffset: 0,
        paramBlockWords: 0,
      }),
    );
    // Raw u32 word at Kind position matches ShapeClass enum value.
    expect(state.shapeBank!.data[handle + ShapeBankHeaderWord.Kind]).toBe(ShapeClass.Type1Rigid);
    expect(state.shapeBank!.data[handle + ShapeBankHeaderWord.TopologyMode]).toBe(TopologyMode.Path);
  });

  it('header word layout matches expected ABI positions', () => {
    // Guard against accidental reordering of the ShapeBankHeaderWord enum.
    expect(ShapeBankHeaderWord.Kind).toBe(0);
    expect(ShapeBankHeaderWord.TopologyMode).toBe(1);
    expect(ShapeBankHeaderWord.Flags).toBe(2);
    expect(ShapeBankHeaderWord.MaterialClass).toBe(3);
    expect(ShapeBankHeaderWord.IndexCount).toBe(4);
    expect(ShapeBankHeaderWord.FirstIndex).toBe(5);
    expect(ShapeBankHeaderWord.BaseVertex).toBe(6);
    expect(ShapeBankHeaderWord.VertexCount).toBe(7);
    expect(ShapeBankHeaderWord.FirstVertex).toBe(8);
    expect(ShapeBankHeaderWord.ParamBlockOffset).toBe(9);
    expect(ShapeBankHeaderWord.ParamBlockWords).toBe(10);
    expect(SHAPE_BANK_HEADER_WORDS).toBe(16);
  });
});
