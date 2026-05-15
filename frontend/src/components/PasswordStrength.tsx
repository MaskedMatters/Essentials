import { CheckCircle2, XCircle } from 'lucide-react';

interface Requirement {
  label: string;
  test: (p: string) => boolean;
}

const REQUIREMENTS: Requirement[] = [
  { label: 'At least 8 characters',        test: (p) => p.length >= 8 },
  { label: 'At least one uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'At least one number',           test: (p) => /\d/.test(p) },
  { label: 'At least one special character', test: (p) => /[!@#$%^&*()_+~`|}{[\]:;?><,./\-=]/.test(p) },
];

interface PasswordStrengthProps {
  password: string;
}

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  if (!password) return null;

  return (
    <div style={{
      marginTop: '-0.75rem',
      marginBottom: '1rem',
      padding: '0.75rem 1rem',
      backgroundColor: 'rgba(15, 23, 42, 0.5)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.35rem',
    }}>
      {REQUIREMENTS.map(({ label, test }) => {
        const met = test(password);
        return (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8rem',
              color: met ? '#4ade80' : 'var(--text-secondary)',
              transition: 'color 0.2s ease',
            }}
          >
            {met
              ? <CheckCircle2 size={13} color="#4ade80" />
              : <XCircle size={13} color="var(--text-secondary)" />}
            {label}
          </div>
        );
      })}
    </div>
  );
}

/** Returns true if ALL requirements are met */
export function isPasswordValid(password: string): boolean {
  return REQUIREMENTS.every(({ test }) => test(password));
}
