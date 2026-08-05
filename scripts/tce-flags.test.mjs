// Tests for the TCE tracker's pure helpers. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enrollsOvarian,
  hasUsSites,
  matchedTerms,
  extractPairFromText,
  tceDrugTerms,
  isQueryableTceDrug,
} from "./tce-flags.mjs";

test("enrollsOvarian matches ovarian and its clinical grouping", () => {
  assert.equal(enrollsOvarian({ conditions: ["Epithelial Ovarian Cancer"] }), true);
  assert.equal(enrollsOvarian({ conditions: ["Fallopian Tube Cancer"] }), true);
  assert.equal(enrollsOvarian({ keywords: ["primary peritoneal carcinoma"] }), true);
  assert.equal(enrollsOvarian({ title: "A study in advanced ovarian cancer" }), true);
  assert.equal(enrollsOvarian({ conditions: ["Non-Small Cell Lung Cancer"] }), false);
  assert.equal(enrollsOvarian({}), false);
});

test("hasUsSites detects a United States location", () => {
  assert.equal(hasUsSites(["United States", "France"]), true);
  assert.equal(hasUsSites(["  United States "]), true);
  assert.equal(hasUsSites(["France", "Germany"]), false);
  assert.equal(hasUsSites([]), false);
});

test("matchedTerms flags engager/bispecific and word-boundary CD3/CD28", () => {
  assert.deepEqual(
    matchedTerms({ briefSummary: "a B7-H4 x CD3 bispecific mAb" }).sort(),
    ["CD3", "bispecific"]
  );
  assert.deepEqual(matchedTerms({ title: "A T-cell engager (TCE) study" }), [
    "T cell engager",
  ]);
  // CD38 / CD30 must NOT match CD3.
  assert.deepEqual(matchedTerms({ briefSummary: "anti-CD38 therapy" }), []);
  assert.deepEqual(matchedTerms({ briefSummary: "CD28 costimulation" }), ["CD28"]);
});

test("extractPairFromText pulls explicit arm pairs, either order", () => {
  assert.deepEqual(extractPairFromText("a B7-H4 x CD3 bispecific mAb"), {
    tCellArm: "CD3",
    tumorTarget: "B7-H4",
    pair: "CD3 × B7-H4",
  });
  assert.deepEqual(extractPairFromText("investigating CD3xMUC16 engager"), {
    tCellArm: "CD3",
    tumorTarget: "MUC16",
    pair: "CD3 × MUC16",
  });
  assert.deepEqual(extractPairFromText("an anti-FOLR1 × anti-CD3 bispecific"), {
    tCellArm: "CD3",
    tumorTarget: "FOLR1",
    pair: "CD3 × FOLR1",
  });
});

test("tceDrugTerms keeps spaced drug codes and named drugs", () => {
  assert.deepEqual(tceDrugTerms(["AMG 160"]), ["AMG 160"]);
  assert.deepEqual(tceDrugTerms(["ISB 1302 250 ng"]), ["ISB 1302"]);
  assert.deepEqual(tceDrugTerms(["Ubamatamab"]), ["Ubamatamab"]);
});

test("tceDrugTerms strips CT.gov type prefixes (even doubled) and dosing", () => {
  assert.deepEqual(tceDrugTerms(["Drug: Drug: QL1706 5mg"]), ["QL1706"]);
  assert.deepEqual(tceDrugTerms(["Biological: REGN4018"]), ["REGN4018"]);
});

test("tceDrugTerms splits combos/schedules and drops generic backbones", () => {
  assert.deepEqual(tceDrugTerms(["Q3W;Cisplatin 50mg"]), []); // generic chemo
  assert.deepEqual(tceDrugTerms(["Carboplatin AUC 5 ivdrip"]), []);
  assert.deepEqual(tceDrugTerms(["Ubamatamab + Carboplatin"]), ["Ubamatamab"]);
  assert.deepEqual(tceDrugTerms(["iv drip"]), []);
});

test("tceDrugTerms collapses dose variants of one drug", () => {
  assert.deepEqual(tceDrugTerms(["ISB 1302 250 ng", "ISB 1302 325 ng"]), ["ISB 1302"]);
});

test("isQueryableTceDrug accepts real identifiers, rejects categories/targets", () => {
  // Real drug identifiers.
  assert.equal(isQueryableTceDrug("REGN4018"), true);
  assert.equal(isQueryableTceDrug("AMG 340"), true);
  assert.equal(isQueryableTceDrug("AZD0486"), true);
  assert.equal(isQueryableTceDrug("ubamatamab"), true);
  assert.equal(isQueryableTceDrug("Blinatumomab"), true);
  // Bare targets / acronyms.
  assert.equal(isQueryableTceDrug("CD3"), false);
  assert.equal(isQueryableTceDrug("BCMA"), false);
  assert.equal(isQueryableTceDrug("HER2"), false);
  // Category labels & procedures.
  assert.equal(isQueryableTceDrug("Bispecific antibody"), false);
  assert.equal(isQueryableTceDrug("CD3 bispecific antibody"), false);
  assert.equal(isQueryableTceDrug("Blood draw"), false);
  assert.equal(isQueryableTceDrug("Activated CIK"), false);
  assert.equal(isQueryableTceDrug("CD33*CD3 BsAb"), false);
  assert.equal(isQueryableTceDrug(""), false);
  assert.equal(isQueryableTceDrug(null), false);
});

test("extractPairFromText ignores non-target tokens and returns null when absent", () => {
  // "CD3 x bispecific" — the second token isn't a real target.
  assert.equal(extractPairFromText("a CD3 x bispecific antibody"), null);
  assert.equal(extractPairFromText("a PD-1 x CTLA-4 bispecific antibody"), null);
  assert.equal(extractPairFromText("no pair mentioned here"), null);
  assert.equal(extractPairFromText(""), null);
  assert.equal(extractPairFromText(null), null);
});
