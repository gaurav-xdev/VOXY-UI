import LegalLayout, { Configured, Section } from "./LegalLayout";
import { TextLink } from "@/ui/primitives";

export default function Terms() {
  return (
    <LegalLayout eyebrow="LEGAL" title="Terms of Service" intro="These terms govern your use of the VOXY website and account features.">
      {(l) => (
        <>
          <Section title="Who we are">
            <p>
              VOXY is operated by <Configured value={l.companyName} label="company name" />
              {l.registrationNumber ? <> (registration no. {l.registrationNumber})</> : null}, <Configured value={l.companyAddress} label="registered address" />. Contact:{" "}
              <Configured value={l.contactEmail} label="contact email" />.
            </p>
          </Section>
          <Section title="Your account">
            <p>
              You must provide a valid email address and keep your password confidential. You are responsible for activity under your account. Tell us promptly if you suspect
              unauthorised access. You can review signed-in devices and sign out of them from your account page.
            </p>
          </Section>
          <Section title="Subscriptions and payment">
            <p>
              Paid plans, where offered, are billed by our payment provider and renew automatically until cancelled. Prices, billing period and taxes are shown before you confirm
              checkout. You can cancel from your account page; cancellation takes effect at the end of the paid period unless stated otherwise. See{" "}
              <TextLink to="/refunds">Refunds &amp; cancellation</TextLink>.
            </p>
          </Section>
          <Section title="Acceptable use">
            <p>
              Don't attempt to disrupt the service, probe it for vulnerabilities without authorisation, access other people's accounts, or use it unlawfully. We may suspend
              accounts that do.
            </p>
          </Section>
          <Section title="Availability and changes">
            <p>
              We aim to keep the service available but do not promise uninterrupted operation. We may change or discontinue features, and we will update these terms when needed.
            </p>
          </Section>
          <Section title="Liability and governing law">
            <p>
              Limitations of liability and your statutory rights depend on where you live and must be set out by the operator's legal adviser:{" "}
              <Configured value={l.reviewed ? "See the operator's final terms." : null} label="liability clause" />. Governing law and jurisdiction:{" "}
              <Configured value={l.jurisdiction} label="jurisdiction" />.
            </p>
          </Section>
          <Section title="Contact">
            <p>
              Questions about these terms: <Configured value={l.contactEmail} label="contact email" />.
            </p>
          </Section>
        </>
      )}
    </LegalLayout>
  );
}
