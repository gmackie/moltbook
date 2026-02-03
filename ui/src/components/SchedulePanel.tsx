import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { ScheduleStateResponse } from '../api/types';

export function SchedulePanel() {
  const [schedule, setSchedule] = useState<ScheduleStateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = async () => {
    const result = await api.getScheduleState();
    if (result.success && result.data) {
      setSchedule(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 5000);
    return () => clearInterval(interval);
  }, []);

  const togglePause = async () => {
    if (!schedule) return;
    const result = schedule.paused
      ? await api.resumeSchedule()
      : await api.pauseSchedule();
    if (result.success) {
      fetchSchedule();
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Schedule</h2>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Schedule</h2>
        <p className="text-red-400">Failed to load schedule</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs ${
            schedule.running ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
          }`}>
            {schedule.running ? 'Running' : 'Stopped'}
          </span>
          {schedule.running && (
            <button
              onClick={togglePause}
              className={`px-3 py-1 rounded text-sm ${
                schedule.paused
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-yellow-600 hover:bg-yellow-500'
              }`}
            >
              {schedule.paused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
      </div>

      {schedule.nextAction && (
        <div className="mb-4 p-3 bg-gray-700/50 rounded">
          <p className="text-sm text-gray-400">Next Action</p>
          <p className="font-medium capitalize">{schedule.nextAction.type}</p>
          <p className="text-sm text-gray-400">
            {new Date(schedule.nextAction.scheduledFor).toLocaleString()}
          </p>
        </div>
      )}

      {schedule.lastAction && (
        <div className="mb-4 p-3 bg-gray-700/50 rounded">
          <p className="text-sm text-gray-400">Last Action</p>
          <div className="flex justify-between items-center">
            <p className="font-medium capitalize">{schedule.lastAction.type}</p>
            <span className={`px-2 py-0.5 rounded text-xs ${
              schedule.lastAction.status === 'completed' ? 'bg-green-900 text-green-300' :
              schedule.lastAction.status === 'failed' ? 'bg-red-900 text-red-300' :
              'bg-yellow-900 text-yellow-300'
            }`}>
              {schedule.lastAction.status}
            </span>
          </div>
          {schedule.lastAction.error && (
            <p className="text-red-400 text-sm mt-1">{schedule.lastAction.error}</p>
          )}
        </div>
      )}

      <div className="border-t border-gray-700 pt-4">
        <p className="text-sm text-gray-400 mb-2">Today's Actions</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span>Posts</span>
            <span className="font-mono">{schedule.actionsToday.posts}</span>
          </div>
          <div className="flex justify-between">
            <span>Comments</span>
            <span className="font-mono">{schedule.actionsToday.comments}</span>
          </div>
          <div className="flex justify-between">
            <span>Votes</span>
            <span className="font-mono">{schedule.actionsToday.votes}</span>
          </div>
          <div className="flex justify-between">
            <span>Browses</span>
            <span className="font-mono">{schedule.actionsToday.browses}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
