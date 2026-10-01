import LegalLayout, { Configured, Section } from "./LegalLayout";

export default function Contact() {
  return (
    <LegalLayout eyebrow="SUPPORT" title="Contact & support" intro="How to reach us about your account, billing, or privacy.">
      {(l) => (
        <>
          <Section title="Support">
            <p>
              {l.supportEmail ? (
                <a className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white" href={`mailto:${l.supportEmail}`}>
                  {l.supportEmail}
                </a>
              ) : (
                <Configured value={null} label="support email" />
              )}
            </p>
            <p>When you write, include your account email. Never send your password. We will never ask for it.</p>
          </Section>
          <Section title="Company">
            <p>
              <Configured value={l.companyName} label="company name" />
              {l.registrationNumber ? <> · registration no. {l.registrationNumber}</> : null}
            </p>
            <p>
              <Configured value={l.companyAddress} label="registered address" />
            </p>
            <p>
              General: <Configured value={l.contactEmail} label="contact email" />
              <br />
              Privacy: <Configured value={l.privacyEmail ?? l.contactEmail} label="privacy email" />
            </p>
          </Section>
        </>
      )}
    </LegalLayout>
  );
}
