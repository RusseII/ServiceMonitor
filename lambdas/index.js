/* eslint-disable no-console */
const fetch = require('node-fetch');

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.RUSSELL_WORK_MONGODB_URI;

let cachedDb = null;
const timestamp = () => new Date().toString();

const peterServer2 = 'https://thegates.online';
const russellServer2 = 'https://russell.work';


let supportedServers = [peterServer2, russellServer2];
const serverNotifications = [peterServer2, russellServer2]


function findCommonElements(currentServer, supported) {
  return supported.includes(currentServer);
}

async function connectToDatabase(uri) {
  console.log('=> connect to database');

  if (cachedDb) {
    console.log('=> using cached database instance');
    return Promise.resolve(cachedDb);
  }

  const connection = await MongoClient.connect(uri);
  console.log('=> creating a new connection');
  cachedDb = connection.db('russell_work');
  return Promise.resolve(cachedDb);
}

async function queryDatabase(db, server, isOnline) {
  console.log('=> query database');

  await db
    .collection('server_status')
    .insertOne({ server, isOnline, timestamp: timestamp() })
    .catch(err => {
      console.log('=> an error occurred: ', err);
      return { statusCode: 500, body: 'error adding to mongodb' };
    });

  return { server, isOnline };
}

const sendTelegramMsg = async text => {
  const headers = { 'Content-Type': 'application/json' };
  const msg = { text, chat_id: '-1001125146235' };
  const resp = await fetch(
    `https://api.telegram.org/bot${process.env.GATES_ONLINE_SERVER_BOT_KEY}/sendMessage`,
    { method: 'POST', body: JSON.stringify(msg), headers }
  ).catch(err => console.log(err));
  if (resp.status !== 200) console.log(resp);
};

const shouldSendAlert = async (db, onlineResults) => {



    return Promise.all(
      supportedServers.map(async (server, i) => {
        if (findCommonElements(server, serverNotifications)) {
        let oldEvent = await db
          .collection('server_status')
          .find({ server })
          .sort({ _id: -1 })
          .limit(1)
          .toArray();
        // Promise.resolve(oldEvent);
        oldEvent = oldEvent.length > 0 ? oldEvent[0] : null;

        if (oldEvent && oldEvent.isOnline !== onlineResults[i]) {
          const text = `${server} ${
            onlineResults[i] ? 'has come online!' : 'has gone offline.'
            }`;
          console.log(oldEvent, onlineResults[i])
          sendTelegramMsg(text);
        }
        return Promise.resolve(oldEvent);
      }
      })
    );
};
const renderBadge = (results, server) => {
  const badgeServer = results.find(s => s.server === server);
  if (!badgeServer) return null;

  let badge;

  if (badgeServer.uptimePercent) {
    badge = {
      schemaVersion: 1,
      // eslint-disable-next-line no-useless-escape
      label: `${badgeServer.server.replace(/^https?\:\/\//i, '')} uptime`,
      message: `${badgeServer.uptimePercent.toFixed(7) * 100}%`,
      color: badgeServer.uptimePercent > 0.98 ? 'success' : badgeServer.uptimePercent > 0.90 ? 'important' : 'critical',
    };
  } else {
    badge = {
      schemaVersion: 1,
      // eslint-disable-next-line no-useless-escape
      label: badgeServer.server.replace(/^https?\:\/\//i, ''),
      message: badgeServer.isOnline ? 'Online' : 'Offline',
      color: badgeServer.isOnline ? 'success' : 'critical',
    };
  }
  return badge;
};

const upTimeCalculation = async db => {
  return Promise.all(
    supportedServers.map(async server => {
      const timesOnline = await db.collection('server_status').count({ server, isOnline: true });
      const timesOffline = await db.collection('server_status').count({ server, isOnline: false });
      return { uptimePercent: timesOnline / (timesOnline + timesOffline) };
    })
  );
};

const executeMongo = async (event, context, callback) => {
  // eslint-disable-next-line no-param-reassign
  context.callbackWaitsForEmptyEventLoop = false;
  if (event.queryStringParameters && event.queryStringParameters.badge) {
    supportedServers = [event.queryStringParameters.badge]
  }
  const db = await connectToDatabase(MONGODB_URI);

  const onlineResponses = await Promise.all(
    supportedServers.map(async server => {
      return fetch(server, { timeout: 3000 }).catch(err => {
        console.log(err);
        return err
      });
    })
  );

  const onlineResults = onlineResponses.map(r => Boolean(r && r.status >= 200 && r.status < 300));
  await shouldSendAlert(db, onlineResults);
  let results = await Promise.all(
    supportedServers.map(async (server, i) =>
      queryDatabase(db, server, onlineResults[i]).catch(err => {
        console.log('=> an error occurred: ', err);
        callback(err);
      })
    )
  );

  if (event.queryStringParameters && event.queryStringParameters.uptimes === '1') {
    const uptimeData = await upTimeCalculation(db);
    results = uptimeData.map((uptime, i) => ({ ...uptime, ...results[i] }));
  }


  if (event.queryStringParameters && event.queryStringParameters.badge) {
    const badge = renderBadge(results, event.queryStringParameters.badge);
    let badgeData;
    if (!badge) {
      badgeData = {
        statusCode: 404,
        body: JSON.stringify({ msg: 'provided sever was not found' }),
      };
    }

    badgeData = { statusCode: 200, body: JSON.stringify(badge) };
    callback(null, badgeData);
  }
  const result = { statusCode: 200, body: JSON.stringify({ servers: results }) };
  console.log('=> returning result: ', result);
  callback(null, result);
};

module.exports.handler = executeMongo;

// executeMongo({body: {city: 'Hammondsville', state: "Ohio"}}, {}, {})
