'use client';

import { useState, useEffect } from 'react';
import { Activity, Database, TrendingUp, AlertCircle, CheckCircle, Clock, XCircle, HardDrive, Cpu, Zap, BarChart3 } from 'lucide-react';

interface ScannerStats {
  scanner: {
    status: string;
    totalScanned: number;
    newPosts: number;
    duplicatePosts: number;
    errors: number;
    lastScanAt: string | null;
    scanDurationMs: number;
    errorMessage: string | null;
  };
  database: {
    totalPosts: number;
    totalCreators?: number;
    recentPosts: Array<{
      id: string;
      text: string | null;
      posted_at: number;
      indexed_at: string;
      permalink: string | null;
    }>;
    dailyStats: Array<{
      date: string;
      post_count: string;
    }>;
    dailyCreators?: Array<{
      date: string;
      creator_count: string;
    }>;
    storage: {
      databaseSize: string;
      databaseSizeBytes: number;
      tables: Array<{
        schemaname: string;
        tablename: string;
        size: string;
        size_bytes: number;
        table_size: string;
        index_size: string;
      }>;
    };
    performance: {
      active_connections?: number | string;
      transactions_committed?: number | string;
      transactions_rolled_back?: number | string;
      disk_blocks_read?: number | string;
      buffer_hits?: number | string;
      tuples_returned?: number | string;
      tuples_fetched?: number | string;
      tuples_inserted?: number | string;
      tuples_updated?: number | string;
      tuples_deleted?: number | string;
      cache_hit_ratio?: number | string;
    };
    indexes: Array<{
      schemaname: string;
      tablename: string;
      indexname: string;
      index_tuples_read: number | string;
      index_tuples_fetched: number | string;
    }>;
    memory: {
      max_connections?: string;
      shared_buffers?: string;
      effective_cache_size?: string;
      work_mem?: string;
    };
  };
}

export default function ScannerDebugPage() {
  const [stats, setStats] = useState<ScannerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/scanner/stats');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    if (autoRefresh) {
      const interval = setInterval(fetchStats, 2000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scanning':
        return <Activity className="animate-spin text-blue-500" size={24} />;
      case 'success':
        return <CheckCircle className="text-green-500" size={24} />;
      case 'error':
        return <XCircle className="text-red-500" size={24} />;
      case 'idle':
        return <Clock className="text-gray-500" size={24} />;
      default:
        return <AlertCircle className="text-yellow-500" size={24} />;
    }
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading scanner statistics...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
              <Activity className="text-purple-500" size={36} />
              Scanner Debug Dashboard
            </h1>
            <p className="text-gray-400">Real-time monitoring of the Sora feed scanner</p>
          </div>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg transition-all ${
              autoRefresh
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {autoRefresh ? '🔄 Auto-refresh ON' : '⏸️ Auto-refresh OFF'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="text-red-500" size={20} />
              <span className="font-semibold">Error:</span>
              <span>{error}</span>
            </div>
            {error.includes('PostgreSQL') && (
              <div className="mt-3 p-3 bg-gray-800 rounded text-sm">
                <p className="text-yellow-400 font-semibold mb-2">🔧 Quick Fix:</p>
                <p className="mb-2">Install PostgreSQL dependencies:</p>
                <code className="bg-gray-900 px-2 py-1 rounded">npm install pg @types/pg</code>
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <a 
                    href="/setup" 
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-white font-semibold"
                  >
                    📋 View Full Setup Guide
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {stats && (
          <>
            {/* Scanner Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-400">Status</h3>
                  {getStatusIcon(stats.scanner.status)}
                </div>
                <div className="text-2xl font-bold capitalize">{stats.scanner.status}</div>
              </div>

              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-400">Total Scanned</h3>
                  <TrendingUp className="text-purple-500" size={20} />
                </div>
                <div className="text-2xl font-bold">{stats.scanner.totalScanned.toLocaleString()}</div>
              </div>

              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-400">New Posts</h3>
                  <CheckCircle className="text-green-500" size={20} />
                </div>
                <div className="text-2xl font-bold text-green-400">{stats.scanner.newPosts.toLocaleString()}</div>
              </div>

              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-400">Duplicates</h3>
                  <AlertCircle className="text-yellow-500" size={20} />
                </div>
                <div className="text-2xl font-bold text-yellow-400">{stats.scanner.duplicatePosts.toLocaleString()}</div>
              </div>
            </div>

            {/* Scanner Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Clock size={24} />
                  Scanner Info
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Last Scan:</span>
                    <span className="font-mono">{formatTimestamp(stats.scanner.lastScanAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Scan Duration:</span>
                    <span className="font-mono">{formatDuration(stats.scanner.scanDurationMs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Errors:</span>
                    <span className={`font-mono ${stats.scanner.errors > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {stats.scanner.errors}
                    </span>
                  </div>
                  {stats.scanner.errorMessage && (
                    <div className="pt-2 border-t border-gray-800">
                      <span className="text-gray-400 block mb-1">Last Error:</span>
                      <span className="text-red-400 text-sm font-mono">{stats.scanner.errorMessage}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Database size={24} />
                  Database Stats
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Total Posts:</span>
                    <span className="text-3xl font-bold text-purple-400">{stats.database.totalPosts.toLocaleString()}</span>
                  </div>
                  {stats.database.totalCreators && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Unique Creators:</span>
                      <span className="text-2xl font-bold text-blue-400">{stats.database.totalCreators.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-800">
                    <span className="text-gray-400 block mb-2">Posts per Day (Last 7 days):</span>
                    <div className="space-y-1">
                      {stats.database.dailyStats.map((day) => (
                        <div key={day.date} className="flex justify-between text-sm">
                          <span className="font-mono">{day.date}</span>
                          <span className="text-purple-400 font-semibold">{parseInt(day.post_count).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {stats.database.dailyCreators && stats.database.dailyCreators.length > 0 && (
                    <div className="pt-2 border-t border-gray-800">
                      <span className="text-gray-400 block mb-2">New Creators per Day (Last 7 days):</span>
                      <div className="space-y-1">
                        {stats.database.dailyCreators.map((day) => (
                          <div key={day.date} className="flex justify-between text-sm">
                            <span className="font-mono">{day.date}</span>
                            <span className="text-blue-400 font-semibold">{parseInt(day.creator_count).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Database Storage & Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Storage Metrics */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <HardDrive className="text-blue-500" size={24} />
                  Storage Metrics
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Database Size:</span>
                    <span className="text-2xl font-bold text-blue-400">{stats.database.storage?.databaseSize || 'Unknown'}</span>
                  </div>
                  
                  {stats.database.storage?.tables && stats.database.storage.tables.length > 0 && (
                    <div className="pt-3 border-t border-gray-800">
                      <span className="text-gray-400 block mb-3">Table Sizes:</span>
                      <div className="space-y-2">
                        {stats.database.storage.tables.slice(0, 5).map((table) => (
                          <div key={table.tablename} className="flex justify-between text-sm">
                            <span className="font-mono text-purple-400">{table.tablename}</span>
                            <div className="text-right">
                              <div className="text-blue-400 font-semibold">{table.size}</div>
                              <div className="text-xs text-gray-500">
                                Table: {table.table_size} | Indexes: {table.index_size}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Zap className="text-yellow-500" size={24} />
                  Performance Metrics
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Active Connections:</span>
                    <span className="font-mono text-green-400">{Number(stats.database.performance?.active_connections || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Cache Hit Ratio:</span>
                    <span className={`font-mono ${
                      (Number(stats.database.performance?.cache_hit_ratio) || 0) > 95 
                        ? 'text-green-400' 
                        : (Number(stats.database.performance?.cache_hit_ratio) || 0) > 85 
                        ? 'text-yellow-400' 
                        : 'text-red-400'
                    }`}>
                      {Number(stats.database.performance?.cache_hit_ratio || 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Transactions:</span>
                    <span className="font-mono text-blue-400">
                      {Number(stats.database.performance?.transactions_committed || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tuples Inserted:</span>
                    <span className="font-mono text-purple-400">
                      {Number(stats.database.performance?.tuples_inserted || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Buffer Hits:</span>
                    <span className="font-mono text-cyan-400">
                      {Number(stats.database.performance?.buffer_hits || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Memory & Index Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Memory Configuration */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Cpu className="text-green-500" size={24} />
                  Memory Configuration
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Max Connections:</span>
                    <span className="font-mono text-green-400">{stats.database.memory?.max_connections || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Shared Buffers:</span>
                    <span className="font-mono text-blue-400">{stats.database.memory?.shared_buffers || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Effective Cache Size:</span>
                    <span className="font-mono text-purple-400">{stats.database.memory?.effective_cache_size || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Work Memory:</span>
                    <span className="font-mono text-yellow-400">{stats.database.memory?.work_mem || 'Unknown'}</span>
                  </div>
                </div>
              </div>

              {/* Index Usage */}
              <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <BarChart3 className="text-orange-500" size={24} />
                  Top Index Usage
                </h3>
                <div className="space-y-2">
                  {stats.database.indexes && stats.database.indexes.length > 0 ? (
                    stats.database.indexes.slice(0, 5).map((index, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-orange-400 truncate">{index.indexname}</div>
                          <div className="text-xs text-gray-500">{index.tablename}</div>
                        </div>
                        <div className="text-right ml-2">
                          <div className="text-orange-400 font-semibold">
                            {Number(index.index_tuples_read || 0).toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">reads</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 text-sm italic">No index statistics available</div>
                  )}
                </div>
              </div>
            </div>

            {/* Recent Posts */}
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <h3 className="text-xl font-bold mb-4">Recent Posts (Last 10)</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-sm text-gray-400">
                      <th className="pb-3 pr-4">ID</th>
                      <th className="pb-3 pr-4">Text</th>
                      <th className="pb-3 pr-4">Indexed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.database.recentPosts.map((post) => (
                      <tr key={post.id} className="border-b border-gray-800/50">
                        <td className="py-3 pr-4">
                          <code className="text-xs bg-gray-800 px-2 py-1 rounded">{post.id.slice(0, 12)}...</code>
                        </td>
                        <td className="py-3 pr-4 max-w-md truncate">
                          {post.text ? (
                            <span className="text-sm">{post.text.slice(0, 60)}...</span>
                          ) : (
                            <span className="text-gray-500 text-sm italic">No text</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-sm font-mono text-gray-400">
                          {formatTimestamp(post.indexed_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

