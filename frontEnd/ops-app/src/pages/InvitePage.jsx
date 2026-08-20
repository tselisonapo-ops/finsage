'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Sparkles } from 'lucide-react';

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  });

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      // Call your Flask backend API
      const response = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          firstName: form.firstName,
          lastName: form.lastName,
          password: form.password,
          confirmPassword: form.confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to accept invitation.');
        return;
      }

      // Success - store session if token returned
      if (data.token && data.companyId) {
        localStorage.setItem('finsphere_token', data.token);
        localStorage.setItem('finsphere_company_id', String(data.companyId));
      }

      setSuccess(true);
      
      // Redirect to signin after showing success message
      setTimeout(() => {
        router.push('/signin');
      }, 2000);

    } catch (err) {
      setError(err.message || 'Could not accept invitation.');
    } finally {
      setBusy(false);
    }
  }

  // Show success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <div className="text-green-500 text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invite Accepted!</h1>
          <p className="text-gray-600">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <main style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Left Branding Section */}
      <section style={{
        flex: 1,
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)',
        color: 'white',
        padding: '4rem',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ 
            width: 48, 
            height: 48, 
            background: '#3b82f6', 
            borderRadius: 12, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            marginBottom: '1.5rem'
          }}>
            <Sparkles size={24} color="white" />
          </div>
          <span style={{ 
            fontSize: '0.875rem', 
            fontWeight: 500, 
            opacity: 0.8,
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            FinSage Nexus
          </span>
          <h1 style={{ 
            fontSize: '2.25rem', 
            fontWeight: 700, 
            lineHeight: 1.2,
            marginTop: '0.5rem',
            marginBottom: '1rem'
          }}>
            Your workspace<br />is ready for you.
          </h1>
          <p style={{ opacity: 0.8, fontSize: '1.1rem' }}>
            Accept your invitation and join your organisation.
          </p>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 12,
          padding: '1rem',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          marginTop: '2rem'
        }}>
          <CheckCircle2 size={20} color="#10b981" />
          <div>
            <strong style={{ display: 'block', fontSize: '0.875rem' }}>Secure invitation</strong>
            <small style={{ opacity: 0.7 }}>Your access was assigned by your organisation.</small>
          </div>
        </div>
      </section>

      {/* Right Form Section */}
      <section style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#f9fafb'
      }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
              Accept invitation
            </h2>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              Create your account details to continue.
            </p>
          </div>

          {!token && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '0.75rem',
              marginBottom: '1rem',
              color: '#dc2626',
              fontSize: '0.875rem'
            }}>
              Invalid invite link: missing token parameter.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: 500, 
                color: '#374151',
                marginBottom: '0.25rem'
              }}>
                First name
              </label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                required
                disabled={!token || busy}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.875rem', 
                fontWeight: 500, 
                color: '#374151',
                marginBottom: '0.25rem'
              }}>
                Last name
              </label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                required
                disabled={!token || busy}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: 500, 
              color: '#374151',
              marginBottom: '0.25rem'
            }}>
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              disabled={!token || busy}
              style={{
                width: '100%',
                padding: '0.625rem',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: '0.875rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '0.875rem', 
              fontWeight: 500, 
              color: '#374151',
              marginBottom: '0.25rem'
            }}>
              Confirm password
            </label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => set('confirmPassword', e.target.value)}
              required
              minLength={8}
              disabled={!token || busy}
              style={{
                width: '100%',
                padding: '0.625rem',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: '0.875rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '0.75rem',
              marginBottom: '1rem',
              color: '#dc2626',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !token}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: busy || !token ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: busy || !token ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {busy ? 'Joining workspace...' : 'Accept invitation'}
          </button>
        </form>
      </section>
    </main>
  );
}
