// Tests for shared drug-name extraction. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { drugTerms, primaryDrug } from "./drugs.mjs";

test("keeps distinctive drug names", () => {
  assert.deepEqual(drugTerms(["Mirvetuximab Soravtansine"]), ["Mirvetuximab Soravtansine"]);
  assert.deepEqual(drugTerms(["AZD5335"]), ["AZD5335"]);
});

test("drops generic backbones, comparators, placebo", () => {
  assert.deepEqual(drugTerms(["Placebo"]), []);
  assert.deepEqual(drugTerms(["Carboplatin", "Paclitaxel"]), []);
  assert.deepEqual(drugTerms(["Pembrolizumab"]), []); // marketed comparator antibody
});

test("splits combinations and keeps only the distinctive agent", () => {
  assert.deepEqual(drugTerms(["Niraparib + investigational agent"]), ["Niraparib"]);
  assert.deepEqual(drugTerms(["Azenosertib plus paclitaxel"]), ["Azenosertib"]);
});

test("strips parentheticals", () => {
  assert.deepEqual(drugTerms(["Pegylated liposomal doxorubicin (PLD)"]), []); // generic
  assert.deepEqual(drugTerms(["Mirvetuximab Soravtansine (MIRV)"]), ["Mirvetuximab Soravtansine"]);
});

test("drops procedure/premedication noise and ambiguous short codes", () => {
  assert.deepEqual(drugTerms(["Computed Tomography (CT)"]), []);
  assert.deepEqual(drugTerms(["H1 receptor antagonist"]), []);
  assert.deepEqual(drugTerms(["CMP 001"]), []); // ambiguous space-code
});

test("dedupes case-insensitively", () => {
  assert.deepEqual(drugTerms(["Olaparib", "olaparib"]), ["Olaparib"]);
});

test("primaryDrug returns the first distinctive term, or null", () => {
  assert.equal(primaryDrug(["Placebo", "Azenosertib"]), "Azenosertib");
  assert.equal(primaryDrug(["Olaparib", "Bevacizumab"]), "Olaparib");
  assert.equal(primaryDrug(["Placebo", "Carboplatin"]), null);
  assert.equal(primaryDrug([]), null);
});
