using System;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace BuaStudentApi.Services
{
    public class PhotoWorkItem
    {
        public string JobId { get; set; } = Guid.NewGuid().ToString("N");
        public string StudentId { get; set; } = string.Empty;
        public byte[] RawBytes { get; set; } = Array.Empty<byte>();
        public float Zoom { get; set; } = 1.0f;
        public int Rotation { get; set; } = 0;
        public bool FlipH { get; set; } = false;
        public float OffsetX { get; set; } = 0.0f;
        public float OffsetY { get; set; } = 0.0f;
        public bool AutoCrop { get; set; } = true;
        public string AcademicYear { get; set; } = "2026/2027";
        public string? College { get; set; }
        public DateTime EnqueuedAt { get; set; } = DateTime.UtcNow;

        // Completion source allows synchronous callers to optionally await the result
        public TaskCompletionSource<PhotoProcessResult> CompletionSource { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    public class PhotoProcessResult
    {
        public bool Success { get; set; }
        public string? RelativePath { get; set; }
        public string? Url { get; set; }
        public string? Error { get; set; }
        public int ProcessedByWorkerId { get; set; }
        public TimeSpan Duration { get; set; }
    }

    public interface IPhotoProcessingQueue
    {
        ValueTask<bool> EnqueueAsync(PhotoWorkItem item, CancellationToken cancellationToken = default);
        IAsyncEnumerable<PhotoWorkItem> ReadAllAsync(CancellationToken cancellationToken = default);
        int CurrentQueueLength { get; }
        int ActiveWorkersCount { get; }
        void IncrementActiveWorkers();
        void DecrementActiveWorkers();
    }

    public class PhotoProcessingQueue : IPhotoProcessingQueue
    {
        private readonly Channel<PhotoWorkItem> _channel;
        private int _queueLength;
        private int _activeWorkers;

        public PhotoProcessingQueue(int capacity = 10000)
        {
            var options = new BoundedChannelOptions(capacity)
            {
                FullMode = BoundedChannelFullMode.Wait,
                SingleReader = false, // Multiple concurrent workers reading simultaneously!
                SingleWriter = false  // Multiple HTTP request threads enqueueing simultaneously!
            };
            _channel = Channel.CreateBounded<PhotoWorkItem>(options);
        }

        public async ValueTask<bool> EnqueueAsync(PhotoWorkItem item, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref _queueLength);
            var written = await _channel.Writer.WaitToWriteAsync(cancellationToken);
            if (written)
            {
                return _channel.Writer.TryWrite(item);
            }
            Interlocked.Decrement(ref _queueLength);
            return false;
        }

        public async IAsyncEnumerable<PhotoWorkItem> ReadAllAsync([System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            while (await _channel.Reader.WaitToReadAsync(cancellationToken))
            {
                while (_channel.Reader.TryRead(out var item))
                {
                    Interlocked.Decrement(ref _queueLength);
                    yield return item;
                }
            }
        }

        public int CurrentQueueLength => Math.Max(0, Volatile.Read(ref _queueLength));
        public int ActiveWorkersCount => Volatile.Read(ref _activeWorkers);

        public void IncrementActiveWorkers() => Interlocked.Increment(ref _activeWorkers);
        public void DecrementActiveWorkers() => Interlocked.Decrement(ref _activeWorkers);
    }
}
