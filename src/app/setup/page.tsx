'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Copy, Terminal, Database, Download } from 'lucide-react';

export default function SetupPage() {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const copyToClipboard = (text: string, stepNumber: number) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(stepNumber);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const steps = [
    {
      title: "Install PostgreSQL Dependencies",
      description: "Install the required Node.js packages for PostgreSQL",
      command: "npm install pg @types/pg",
      icon: <Download className="text-blue-500" size={24} />
    },
    {
      title: "Setup Environment Variables",
      description: "Copy the example environment file and configure your database",
      command: "cp env.example .env",
      icon: <Terminal className="text-green-500" size={24} />
    },
    {
      title: "Create PostgreSQL Database",
      description: "Create the database for storing Sora posts",
      command: "sudo -u postgres createdb sora_feed",
      icon: <Database className="text-purple-500" size={24} />
    },
    {
      title: "Start the Application",
      description: "Run the application to view the admin and player interfaces",
      command: "npm run dev",
      icon: <Terminal className="text-orange-500" size={24} />
    }
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Sora Feed Scanner Setup
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Get your Sora Feed application up and running in 4 simple steps. 
            The application connects to a remote database that's populated by a separate scanner service.
          </p>
        </div>

        {/* Prerequisites */}
        <div className="bg-gray-900 rounded-lg p-6 mb-8 border border-gray-800">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <CheckCircle className="text-green-500" size={28} />
            Prerequisites
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-gray-300">
            <div>
              <h3 className="font-semibold text-white mb-2">✅ Required</h3>
              <ul className="space-y-1 text-sm">
                <li>• Node.js 18+ installed</li>
                <li>• npm or yarn package manager</li>
                <li>• PostgreSQL 10+ installed</li>
                <li>• Terminal/command line access</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">📋 What you&apos;ll get</h3>
              <ul className="space-y-1 text-sm">
                <li>• Automatic post indexing every 10 seconds</li>
                <li>• Duplicate detection and prevention</li>
                <li>• Real-time monitoring dashboard</li>
                <li>• Full-text search capabilities</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Setup Steps */}
        <div className="space-y-6">
          {steps.map((step, index) => (
            <div key={index} className="bg-gray-900 rounded-lg p-6 border border-gray-800 hover:border-gray-700 transition-colors">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                    {step.icon}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-semibold text-purple-400">Step {index + 1}</span>
                    <h3 className="text-xl font-bold">{step.title}</h3>
                  </div>
                  <p className="text-gray-400 mb-4">{step.description}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-800 rounded-lg p-3 font-mono text-sm border border-gray-700">
                      <code className="text-green-400">{step.command}</code>
                    </div>
                    <button
                      onClick={() => copyToClipboard(step.command, index)}
                      className="p-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-2"
                      title="Copy command"
                    >
                      {copiedStep === index ? (
                        <CheckCircle size={16} className="text-green-400" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Additional Configuration */}
        <div className="bg-gray-900 rounded-lg p-6 mt-8 border border-gray-800">
          <h2 className="text-2xl font-bold mb-4">⚙️ Configuration</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Environment Variables (.env)</h3>
              <div className="bg-gray-800 rounded-lg p-4 font-mono text-sm">
                <div className="text-gray-400"># Database Configuration</div>
                <div><span className="text-blue-400">DB_HOST</span>=localhost</div>
                <div><span className="text-blue-400">DB_PORT</span>=5432</div>
                <div><span className="text-blue-400">DB_NAME</span>=sora_feed</div>
                <div><span className="text-blue-400">DB_USER</span>=postgres</div>
                <div><span className="text-blue-400">DB_PASSWORD</span>=your_password_here</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          <a
            href="/scanner-debug"
            className="bg-purple-600 hover:bg-purple-700 rounded-lg p-4 text-center transition-colors block"
          >
            <div className="text-2xl mb-2">📊</div>
            <div className="font-semibold">Debug Dashboard</div>
            <div className="text-sm text-purple-200">Monitor scanner status</div>
          </a>
          <Link
            href="/"
            className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-center transition-colors block"
          >
            <div className="text-2xl mb-2">🏠</div>
            <div className="font-semibold">Main App</div>
            <div className="text-sm text-gray-400">View Sora feed</div>
          </Link>
          <a
            href="https://github.com/fourtytwo42/soraFeed"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 text-center transition-colors block"
          >
            <div className="text-2xl mb-2">📚</div>
            <div className="font-semibold">Documentation</div>
            <div className="text-sm text-gray-400">Full setup guide</div>
          </a>
        </div>

        {/* Troubleshooting */}
        <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-6 mt-8">
          <h2 className="text-2xl font-bold mb-4 text-yellow-400">🔧 Troubleshooting</h2>
          <div className="space-y-3 text-sm">
            <div>
              <strong className="text-yellow-300">PostgreSQL not installed?</strong>
              <p className="text-gray-300">Ubuntu/Debian: <code className="bg-gray-800 px-2 py-1 rounded">sudo apt-get install postgresql postgresql-contrib</code></p>
              <p className="text-gray-300">macOS: <code className="bg-gray-800 px-2 py-1 rounded">brew install postgresql</code></p>
            </div>
            <div>
              <strong className="text-yellow-300">Permission denied?</strong>
              <p className="text-gray-300">Set PostgreSQL password: <code className="bg-gray-800 px-2 py-1 rounded">sudo -u postgres psql -c &quot;ALTER USER postgres PASSWORD &apos;yourpassword&apos;;&quot;</code></p>
            </div>
            <div>
              <strong className="text-yellow-300">Still having issues?</strong>
              <p className="text-gray-300">Check the <code className="bg-gray-800 px-2 py-1 rounded">DATABASE_SETUP.md</code> file for detailed instructions.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
