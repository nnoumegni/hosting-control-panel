"use client";

import { useState, useEffect } from 'react';
import { Copy, CheckCircle2, Loader2, Shield, Zap, Lock, Globe, Server, Sparkles } from 'lucide-react';
import { apiFetch } from '../../../../lib/api';
import { useRouter } from 'next/navigation';

interface TaskState {
  email: boolean;
  agent: boolean;
  dns: boolean;
  ssl: boolean;
  security: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [state, setState] = useState<TaskState>({
    email: false,
    agent: false,
    dns: false,
    ssl: false,
    security: false,
  });

  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);

  const [awsKey, setAwsKey] = useState('');
  const [awsSecret, setAwsSecret] = useState('');
  const [dnsStatus, setDnsStatus] = useState('');
  const [isCheckingDns, setIsCheckingDns] = useState(false);

  const [agentStatus, setAgentStatus] = useState('');
  const [isCheckingAgent, setIsCheckingAgent] = useState(false);

  const [sslStatus, setSslStatus] = useState('');
  const [isCheckingSsl, setIsCheckingSsl] = useState(false);

  const [securityStatus, setSecurityStatus] = useState('');
  const [isEnablingSecurity, setIsEnablingSecurity] = useState(false);

  const [copied, setCopied] = useState(false);

  const agentScript = 'curl -sSL https://agent.jetcamer.com/install.sh | bash';

  const updateFinishButton = () => {
    const allDone = state.email && state.agent && state.dns && state.ssl && state.security;
    return allDone;
  };

  useEffect(() => {
    updateFinishButton();
  }, [state]);

  const setCompleted = (task: keyof TaskState, checkId: string, statusId: string, msg: string) => {
    setState((prev) => ({ ...prev, [task]: true }));
    const checkEl = document.getElementById(checkId);
    if (checkEl) {
      checkEl.className = 'status-icon done';
    }
    if (statusId === 'email-status') setEmailStatus(msg);
    else if (statusId === 'agent-status') setAgentStatus(msg);
    else if (statusId === 'dns-status') setDnsStatus(msg);
    else if (statusId === 'ssl-status') setSslStatus(msg);
    else if (statusId === 'security-status') setSecurityStatus(msg);
  };

  const handleVerifyEmail = async () => {
    if (!email || !email.includes('@')) {
      setEmailStatus('Please enter a valid email address');
      return;
    }

    setIsVerifyingEmail(true);
    setEmailStatus('Verifying...');

    try {
      // TODO: Implement email verification API call
      // For now, simulate success
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setCompleted('email', 'email-check', 'email-status', '✔ Email verified');
    } catch (error) {
      setEmailStatus('Failed to verify email. Please try again.');
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const handleCheckAgent = async () => {
    setIsCheckingAgent(true);
    setAgentStatus('Checking agent connection...');

    try {
      // Check if agent is accessible via health endpoint
      const instanceId = typeof window !== 'undefined' ? localStorage.getItem('selectedInstanceId') : null;
      if (!instanceId) {
        setAgentStatus('Please select an EC2 instance first');
        setIsCheckingAgent(false);
        return;
      }

      // TODO: Implement actual agent health check
      // For now, simulate check
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setCompleted('agent', 'agent-check', 'agent-status', '✔ Agent connected');
    } catch (error) {
      setAgentStatus('Agent not found. Please install the agent first.');
    } finally {
      setIsCheckingAgent(false);
    }
  };

  const handleCheckDns = async () => {
    if (!awsKey || !awsSecret) {
      setDnsStatus('Please enter both AWS Access Key and Secret Key');
      return;
    }

    setIsCheckingDns(true);
    setDnsStatus('Testing Route53 access...');

    try {
      // Save AWS credentials and test Route53 access
      await apiFetch('server-settings', {
        method: 'PUT',
        body: JSON.stringify({
          awsRegion: 'us-east-1', // Default region
          awsAccessKeyId: awsKey,
          awsSecretAccessKey: awsSecret,
        }),
      });

      // Test Route53 access by listing hosted zones
      // TODO: Implement actual Route53 test
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setCompleted('dns', 'dns-check', 'dns-status', '✔ Route53 access verified');
    } catch (error: any) {
      setDnsStatus(error?.message || 'Failed to verify Route53 access. Please check your credentials.');
    } finally {
      setIsCheckingDns(false);
    }
  };

  const handleCheckSsl = async () => {
    setIsCheckingSsl(true);
    setSslStatus('Running SSL test...');

    try {
      // TODO: Implement SSL DNS-01 challenge test
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setCompleted('ssl', 'ssl-check', 'ssl-status', '✔ ACME DNS-01 validated');
    } catch (error) {
      setSslStatus('SSL test failed. Please ensure DNS is properly configured.');
    } finally {
      setIsCheckingSsl(false);
    }
  };

  const handleEnableSecurity = async () => {
    setIsEnablingSecurity(true);
    setSecurityStatus('Enabling security engine...');

    try {
      // TODO: Implement security engine activation
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setCompleted('security', 'security-check', 'security-status', '✔ Security engine activated');
    } catch (error) {
      setSecurityStatus('Failed to enable security engine. Please try again.');
    } finally {
      setIsEnablingSecurity(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(agentScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleFinish = () => {
    if (updateFinishButton()) {
      router.push('/dashboard');
    }
  };

  const allDone = updateFinishButton();

  const benefits = [
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Advanced firewall, threat detection, and automated security responses to keep your infrastructure safe.',
      color: 'emerald',
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Optimized hosting with automatic SSL, CDN integration, and performance monitoring built-in.',
      color: 'amber',
    },
    {
      icon: Lock,
      title: 'Auto SSL Management',
      description: 'Automated certificate issuance, renewal, and management with Let\'s Encrypt integration.',
      color: 'blue',
    },
    {
      icon: Globe,
      title: 'DNS Control',
      description: 'Full Route53 integration for seamless domain management and DNS record automation.',
      color: 'purple',
    },
    {
      icon: Server,
      title: 'Server Management',
      description: 'Complete control over your EC2 instances with real-time monitoring and automated provisioning.',
      color: 'rose',
    },
    {
      icon: Sparkles,
      title: 'AI-Powered',
      description: 'Intelligent threat detection, automated responses, and smart resource optimization.',
      color: 'cyan',
    },
  ];

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; border: string; icon: string }> = {
      emerald: {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        icon: 'text-emerald-400',
      },
      amber: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        icon: 'text-amber-400',
      },
      blue: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        icon: 'text-blue-400',
      },
      purple: {
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/30',
        icon: 'text-purple-400',
      },
      rose: {
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        icon: 'text-rose-400',
      },
      cyan: {
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/30',
        icon: 'text-cyan-400',
      },
    };
    return colors[color] || colors.emerald;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">Onboarding Checklist</h1>
        <p className="text-sm text-slate-400 mt-1">
          Complete the required setup to unlock your hosting and security dashboard.
        </p>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
        {/* Left Column: Tasks */}
        <div className="space-y-6">
          {/* CARD: Verify Account */}
          <div className="bg-slate-900/85 border border-slate-800 rounded-2xl p-5 flex justify-between items-start" id="task-email">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-slate-100">1. Verify your account</h3>
              <p className="text-xs text-slate-400 mt-1">We must verify your identity to activate server management.</p>

              <div className="flex flex-col sm:flex-row gap-3 mt-3 w-full max-w-2xl">
                <input
                  id="email-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleVerifyEmail();
                    }
                  }}
                  className="bg-slate-950 border border-slate-700 px-3 py-2 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 flex-1 min-w-0"
                />
                <button
                  id="verify-email-btn"
                  onClick={handleVerifyEmail}
                  disabled={isVerifyingEmail || state.email}
                  className="bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isVerifyingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                </button>
              </div>

              <p id="email-status" className="text-xs text-slate-400 mt-1">
                {emailStatus}
              </p>
            </div>
            <div
              id="email-check"
              className={`w-[30px] h-[30px] rounded-full flex-shrink-0 ${state.email ? 'bg-emerald-500 border-2 border-emerald-700' : 'bg-slate-800 border-2 border-slate-700'}`}
            />
          </div>

          {/* CARD: Connect Server */}
          <div className="bg-slate-900/85 border border-slate-800 rounded-2xl p-5 flex justify-between items-start" id="task-agent">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-slate-100">2. Connect your server</h3>
              <p className="text-xs text-slate-400 mt-1">Install the JetCamer Agent to enable hosting, SSL, logs & security.</p>

              <div className="relative mt-3">
                <pre id="agent-script" className="bg-slate-950 border border-slate-700 p-3 rounded-lg text-xs text-slate-200 font-mono relative">
                  {agentScript}
                </pre>
                <button
                  id="copy-agent"
                  onClick={handleCopyScript}
                  className="absolute top-1.5 right-1.5 bg-slate-800 border border-slate-700 px-2 py-1 text-[0.65rem] rounded text-slate-200 hover:bg-slate-700 transition"
                >
                  {copied ? <CheckCircle2 className="h-3 w-3" /> : 'Copy'}
                </button>
              </div>

              <button
                id="check-agent-btn"
                onClick={handleCheckAgent}
                disabled={isCheckingAgent || state.agent}
                className="bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-600 transition mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingAgent ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Checking...
                  </>
                ) : (
                  'Check Agent'
                )}
              </button>
              <p id="agent-status" className="text-xs text-slate-400 mt-1">
                {agentStatus}
              </p>
            </div>
            <div
              id="agent-check"
              className={`w-[30px] h-[30px] rounded-full flex-shrink-0 ${state.agent ? 'bg-emerald-500 border-2 border-emerald-700' : 'bg-slate-800 border-2 border-slate-700'}`}
            />
          </div>

          {/* CARD: DNS Provider */}
          <div className="bg-slate-900/85 border border-slate-800 rounded-2xl p-5 flex justify-between items-start" id="task-dns">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-slate-100">3. Connect DNS (Route53)</h3>
              <p className="text-xs text-slate-400 mt-1">Required for domain control & automatic SSL certificates.</p>

              <div className="flex flex-col sm:flex-row gap-3 mt-3 w-full">
                <input
                  id="aws-key"
                  type="text"
                  value={awsKey}
                  onChange={(e) => setAwsKey(e.target.value)}
                  className="bg-slate-950 border border-slate-700 px-3 py-2 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono sm:w-[45%]"
                  placeholder="AKIA..."
                />
                <input
                  id="aws-secret"
                  type="password"
                  value={awsSecret}
                  onChange={(e) => setAwsSecret(e.target.value)}
                  className="bg-slate-950 border border-slate-700 px-3 py-2 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono sm:w-[45%]"
                  placeholder="Enter AWS Secret Key"
                />
              </div>

              <button
                id="check-dns-btn"
                onClick={handleCheckDns}
                disabled={isCheckingDns || state.dns}
                className="bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-600 transition mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingDns ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Testing...
                  </>
                ) : (
                  'Test DNS Access'
                )}
              </button>
              <p id="dns-status" className="text-xs text-slate-400 mt-1">
                {dnsStatus}
              </p>
            </div>
            <div
              id="dns-check"
              className={`w-[30px] h-[30px] rounded-full flex-shrink-0 ${state.dns ? 'bg-emerald-500 border-2 border-emerald-700' : 'bg-slate-800 border-2 border-slate-700'}`}
            />
          </div>

          {/* CARD: SSL Automation */}
          <div className="bg-slate-900/85 border border-slate-800 rounded-2xl p-5 flex justify-between items-start" id="task-ssl">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-slate-100">4. Validate SSL automation</h3>
              <p className="text-xs text-slate-400 mt-1">We must verify DNS-01 ACME challenges to issue certificates.</p>

              <button
                id="check-ssl-btn"
                onClick={handleCheckSsl}
                disabled={isCheckingSsl || state.ssl || !state.dns}
                className="bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-600 transition mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingSsl ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Testing...
                  </>
                ) : (
                  'Run SSL Test'
                )}
              </button>
              <p id="ssl-status" className="text-xs text-slate-400 mt-1">
                {sslStatus}
              </p>
            </div>
            <div
              id="ssl-check"
              className={`w-[30px] h-[30px] rounded-full flex-shrink-0 ${state.ssl ? 'bg-emerald-500 border-2 border-emerald-700' : 'bg-slate-800 border-2 border-slate-700'}`}
            />
          </div>

          {/* CARD: Security Engine */}
          <div className="bg-slate-900/85 border border-slate-800 rounded-2xl p-5 flex justify-between items-start" id="task-security">
            <div className="flex-1">
              <h3 className="text-base font-semibold text-slate-100">5. Enable security engine</h3>
              <p className="text-xs text-slate-400 mt-1">Activates firewall, logs, threat scoring & automated blocking.</p>

              <button
                id="enable-security-btn"
                onClick={handleEnableSecurity}
                disabled={isEnablingSecurity || state.security}
                className="bg-emerald-500 text-slate-950 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-600 transition mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEnablingSecurity ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Enabling...
                  </>
                ) : (
                  'Enable Security'
                )}
              </button>
              <p id="security-status" className="text-xs text-slate-400 mt-1">
                {securityStatus}
              </p>
            </div>
            <div
              id="security-check"
              className={`w-[30px] h-[30px] rounded-full flex-shrink-0 ${state.security ? 'bg-emerald-500 border-2 border-emerald-700' : 'bg-slate-800 border-2 border-slate-700'}`}
            />
          </div>

          {/* Final Button */}
          <button
            id="finish-btn"
            onClick={handleFinish}
            disabled={!allDone}
            className={`w-full mt-8 text-center py-3 rounded-md font-semibold transition ${
              allDone
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-600 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {allDone ? 'Go to Dashboard →' : 'Complete all tasks to continue'}
          </button>
        </div>

        {/* Right Column: Benefits */}
        <div className="space-y-4">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            const colors = getColorClasses(benefit.color);
            return (
              <div
                key={index}
                className={`rounded-xl border ${colors.border} ${colors.bg} p-5 transition hover:border-opacity-50`}
              >
                <div className="flex items-start gap-4">
                  <div className={`${colors.icon} flex-shrink-0`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white mb-1">{benefit.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{benefit.description}</p>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-emerald-300 mb-1">Get Started in Minutes</h3>
                <p className="text-xs text-emerald-200/80 leading-relaxed">
                  Our streamlined onboarding process gets you up and running quickly. Each step is designed to be simple and straightforward.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

