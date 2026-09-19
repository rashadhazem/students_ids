import { useState, useEffect } from 'react';
import * as signalR from '@microsoft/signalr';
import { apiClient, API_BASE_URL } from '../api/client';

export interface JobProgressState {
  progress: number;
  status: 'Pending' | 'Processing' | 'Completed' | 'Failed' | string;
  message: string | null;
  result: any | null;
  error: string | null;
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
}

export const useJobProgress = (jobId: string | null) => {
  const [state, setState] = useState<JobProgressState>({
    progress: 0,
    status: 'Pending',
    message: null,
    result: null,
    error: null,
    isRunning: false,
    isCompleted: false,
    isFailed: false,
  });

  useEffect(() => {
    if (!jobId) {
      setState({
        progress: 0,
        status: 'Pending',
        message: null,
        result: null,
        error: null,
        isRunning: false,
        isCompleted: false,
        isFailed: false,
      });
      return;
    }

    setState(prev => ({ ...prev, isRunning: true, status: 'Processing' }));

    const token = localStorage.getItem('bua_token');
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/job-progress${token ? `?access_token=${token}` : ''}`, {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    connection.on('ProgressUpdated', (data: any) => {
      if (data.jobId === jobId) {
        setState(prev => ({
          ...prev,
          progress: data.progress,
          status: data.status || 'Processing',
          message: data.message || prev.message,
          isRunning: true,
          isCompleted: false,
          isFailed: false,
        }));
      }
    });

    connection.on('JobCompleted', (data: any) => {
      if (data.jobId === jobId) {
        setState({
          progress: 100,
          status: 'Completed',
          message: data.result?.message || 'اكتملت العملية بنجاح',
          result: data.result,
          error: null,
          isRunning: false,
          isCompleted: true,
          isFailed: false,
        });
      }
    });

    connection.on('JobFailed', (data: any) => {
      if (data.jobId === jobId) {
        setState(prev => ({
          ...prev,
          status: 'Failed',
          error: data.error || 'حدث خطأ غير متوقع',
          isRunning: false,
          isCompleted: false,
          isFailed: true,
        }));
      }
    });

    let isUnmounted = false;
    let fallbackInterval: any = null;

    const pollRestStatus = async () => {
      try {
        const res = await apiClient.get(`/jobs/${jobId}`);
        if (isUnmounted || !res.data?.success) return;

        const data = res.data;
        const status = data.status;

        if (status === 'Completed') {
          setState({
            progress: 100,
            status: 'Completed',
            message: data.result?.message || 'اكتملت العملية بنجاح',
            result: data.result,
            error: null,
            isRunning: false,
            isCompleted: true,
            isFailed: false,
          });
          if (fallbackInterval) clearInterval(fallbackInterval);
        } else if (status === 'Failed') {
          setState(prev => ({
            ...prev,
            status: 'Failed',
            error: data.error || 'حدث خطأ أثناء تنفيذ المهمة',
            isRunning: false,
            isCompleted: false,
            isFailed: true,
          }));
          if (fallbackInterval) clearInterval(fallbackInterval);
        } else {
          setState(prev => ({
            ...prev,
            progress: data.progress ?? prev.progress,
            status: data.status || 'Processing',
            isRunning: true,
            isCompleted: false,
            isFailed: false,
          }));
        }
      } catch {
        // Silently ignore polling errors to let SignalR or retry proceed
      }
    };

    connection
      .start()
      .then(() => {
        if (!isUnmounted) {
          return connection.invoke('JoinJobGroup', jobId);
        }
      })
      .catch((err) => {
        console.warn('SignalR connection failed, activating REST polling fallback:', err);
        // Immediately trigger first poll and run recurring
        pollRestStatus();
        fallbackInterval = setInterval(pollRestStatus, 1500);
      });

    // Secondary safety poll every 3 seconds to guarantee state sync
    const safetyPoll = setInterval(() => {
      if (!state.isCompleted && !state.isFailed) {
        pollRestStatus();
      }
    }, 3000);

    return () => {
      isUnmounted = true;
      clearInterval(safetyPoll);
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke('LeaveJobGroup', jobId).catch(() => {});
        connection.stop();
      }
    };
  }, [jobId]);

  return state;
};
