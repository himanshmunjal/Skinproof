import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy & safety — SkinProof" };

const STORED = [
  ["Your photos", "Stored in your SkinProof account's database and sent to YouCam only to analyze them. YouCam deletes its copy of results after 24 hours."],
  ["Scores & zone maps", "The 15 concern scores, skin age and zone masks from each scan, so progress can be compared over time."],
  ["Shelf & label photos", "Ingredient lists you add. Label photos and pasted page text go to the AI provider (Gemini or Groq) only to read the ingredients."],
  ["Diary & coach chat", "What you log and ask. The coach sends only the data it needs for an answer to the AI provider."],
];

const SEE_A_DOCTOR = [
  "Painful, deep or cystic acne, or acne leaving scars",
  "A mole or spot that is new, growing, bleeding or changing colour or shape",
  "A sudden, spreading or severe rash, swelling, or signs of infection (warmth, pus, fever)",
  "Any reaction to a product that doesn't settle within a few days of stopping it",
];

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Privacy & safety" subtitle="What SkinProof keeps, who sees it, and what it can't tell you." />

      <section className="grid gap-3 md:grid-cols-2">
        {STORED.map(([title, body]) => (
          <Card key={title} className="text-sm">
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-muted">{body}</p>
          </Card>
        ))}
      </section>

      <Card className="space-y-2 text-sm">
        <p className="font-medium">Your control</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>No sign-up, email or name: your account is an anonymous browser cookie.</li>
          <li>
            <strong className="text-ink">Delete all my data</strong> on the{" "}
            <Link href="/" className="font-medium text-accent">
              home page
            </Link>{" "}
            removes every photo, scan, product, trial, diary entry and chat at once.
          </li>
          <li>Brands only ever see Verified Results you chose to share, anonymized, and only once 3+ people reviewed a product.</li>
          <li>No ads, no trackers, no selling of data.</li>
        </ul>
      </Card>

      <Card className="space-y-2 border-warn/40 bg-warn-soft/40 text-sm">
        <p className="font-medium">Not medical advice</p>
        <p className="text-muted">
          SkinProof measures how skin looks in a photo. It is not a medical device, doesn&apos;t diagnose conditions and doesn&apos;t replace a
          dermatologist. See a doctor promptly for:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          {SEE_A_DOCTOR.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="text-muted">
          The{" "}
          <Link href="/report" className="font-medium text-accent">
            dermatologist report
          </Link>{" "}
          puts your measured history on one page to bring to that appointment.
        </p>
      </Card>
    </div>
  );
}
