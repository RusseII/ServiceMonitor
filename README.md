# ServiceMonitor
Monitors the Gates server &amp; sends telegram alerts when server status changes.

Deployed at [https://4mpgsamyqb.execute-api.us-east-1.amazonaws.com/server_status](https://4mpgsamyqb.execute-api.us-east-1.amazonaws.com/server_status)

Add `?uptimes=1` to return uptimes in result

Example: [https://4mpgsamyqb.execute-api.us-east-1.amazonaws.com/server_status?uptimes=1](https://4mpgsamyqb.execute-api.us-east-1.amazonaws.com/server_status?uptimes=1)


You need `RUSSELL_WORK_MONGODB_URI` env variable to store data in MongoDB
You need `GATES_ONLINE_SERVER_BOT_KEY` to send messages to the Gates server chat.

Deploy to AWS with `yarn deploy` - you will need aws keys with the appropriate permissions. 
