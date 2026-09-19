using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;

namespace BuaStudentApi.Hubs
{
    public class JobProgressHub : Hub
    {
        public async Task JoinJobGroup(string jobId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"job_{jobId}");
        }

        public async Task LeaveJobGroup(string jobId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"job_{jobId}");
        }
    }
}
