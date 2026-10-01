import LegalLayout, { Configured, Section } from "./LegalLayout";
import { TextLink } from "@/ui/primitives";

export default function Privacy() {
  return (
    <LegalLayout eyebrow="LEGAL" title="Privacy Notice" intro="What VOXY collects when you use this site and an account, why, and who else touches it.">
      {(l) => (
        <>
          <Section title="Who is responsible">
            <p>
              <Configured value={l.companyName} label="company name" />, <Configured value={l.companyAddress} label="registered address" />. Privacy contact:{" "}
              <Configured value={l.privacyEmail ?? l.contactEmail} label="privacy email" />.
            </p>
          </Section>
          <Section title="What we process">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="font-medium text-white/85">Account data:</strong> your email address and a salted Argon2id hash of your password. We never store your password
                itself.
              </li>
              <li>
                <strong className="font-medium text-white/85">Session and security records:</strong> when and from which IP address and browser you signed in, password changes,
                failed attempts and similar events. These protect your account and are shown to you on your account page.
              </li>
              <li>
                <strong className="font-medium text-white/85">Waiting list:</strong> the email address you submit to request early access.
              </li>
              <li>
                <strong className="font-medium text-white/85">Billing:</strong> if you subscribe, our payment provider collects your payment details. We receive and store only
                identifiers and subscription status (customer ID, plan, renewal dates). Card numbers never reach VOXY servers.
              </li>
              <li>
                <strong className="font-medium text-white/85">Server logs:</strong> request ID, time, path, status, IP address. Passwords, session tokens and request bodies are not
                logged.
              </li>
            </ul>
          </Section>
          <Section title="Cookies">
            <p>
              We set only strictly necessary cookies (sign-in session and a device marker that prevents attackers from locking you out). There are no advertising or analytics
              cookies. Details: <TextLink to="/privacy-preferences">Privacy preferences</TextLink>.
            </p>
          </Section>
          <Section title="Who else receives data">
            <ul className="list-disc space-y-2 pl-5">
              <li>Payment provider (billing only).</li>
              <li>Email delivery provider (verification and password-reset emails).</li>
              <li>
                Hosting and database providers: <Configured value={null} label="list hosting providers and regions" />.
              </li>
            </ul>
          </Section>
          <Section title="Retention and your choices">
            <p>
              You can delete your account from your account page, which removes your sign-in and associated personal data. Some records may be retained where the law requires (for
              example, invoices). Retention periods, legal bases and the rights that apply to you must be confirmed by the operator:{" "}
              <Configured value={l.reviewed ? "See the operator's final notice." : null} label="retention periods and legal bases" />.
            </p>
            <p>
              To ask about your data, contact <Configured value={l.privacyEmail ?? l.contactEmail} label="privacy email" />.
            </p>
          </Section>
        </>
      )}
    </LegalLayout>
  );
}
