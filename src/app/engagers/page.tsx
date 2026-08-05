import PageHeader from "@/components/PageHeader";
import TceTable from "@/components/TceTable";
import { getTceSnapshot } from "@/lib/tce";

export const metadata = {
  title: "T-Cell Engagers — Clarion",
};

export default function EngagersPage() {
  const snap = getTceSnapshot();
  return (
    <>
      <PageHeader
        title="T-Cell Engagers"
        subtitle="Every ClinicalTrials.gov trial in the T-cell-engager modality net (bispecific / CD3 / CD28), across all indications — with the two arm targets and flags for ovarian enrollment and US sites."
      />
      <TceTable
        trials={snap.trials}
        stats={{
          total: snap.total,
          tceCount: snap.tceCount,
          muc16Count: snap.muc16Count,
          generatedAt: snap.generatedAt,
        }}
      />
    </>
  );
}
