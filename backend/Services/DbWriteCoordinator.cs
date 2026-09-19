using System;
using System.Threading;
using System.Threading.Tasks;

namespace BuaStudentApi.Services
{
    public interface IDbWriteCoordinator
    {
        Task<T> ExecuteWriteAsync<T>(Func<Task<T>> writeAction, CancellationToken cancellationToken = default);
        Task ExecuteWriteAsync(Func<Task> writeAction, CancellationToken cancellationToken = default);
    }

    public class DbWriteCoordinator : IDbWriteCoordinator
    {
        // Serializes SQLite write transactions to prevent "database is locked" errors under 5,000+ concurrency
        private readonly SemaphoreSlim _writeGate = new(1, 1);

        public async Task<T> ExecuteWriteAsync<T>(Func<Task<T>> writeAction, CancellationToken cancellationToken = default)
        {
            // Acquire write lock with a generous timeout (30 seconds)
            var acquired = await _writeGate.WaitAsync(TimeSpan.FromSeconds(30), cancellationToken);
            if (!acquired)
            {
                throw new TimeoutException("تعذر الحصول على قفل الكتابة في قاعدة البيانات بسبب الضغط الشديد. يرجى إعادة المحاولة.");
            }

            try
            {
                return await writeAction();
            }
            finally
            {
                _writeGate.Release();
            }
        }

        public async Task ExecuteWriteAsync(Func<Task> writeAction, CancellationToken cancellationToken = default)
        {
            var acquired = await _writeGate.WaitAsync(TimeSpan.FromSeconds(30), cancellationToken);
            if (!acquired)
            {
                throw new TimeoutException("تعذر الحصول على قفل الكتابة في قاعدة البيانات بسبب الضغط الشديد. يرجى إعادة المحاولة.");
            }

            try
            {
                await writeAction();
            }
            finally
            {
                _writeGate.Release();
            }
        }
    }
}
