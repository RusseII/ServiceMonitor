"use strict";
const fetch = require('node-fetch');

const MongoClient = require('mongodb').MongoClient;
const MONGODB_URI = process.env.RUSSELL_WORK_MONGODB_URI; 

let cachedDb = null;
const timestamp = () => new Date().toString();

const peterServer = 'https://thegates.online'
const russellServer = 'https://russell.work'

//change it so everything uses this instead of the indivually defined stuff lmao
const supportedServers = [russellServer, peterServer]

async function connectToDatabase(uri) {
    console.log('=> connect to database');

    if (cachedDb) {
        console.log('=> using cached database instance');
        return Promise.resolve(cachedDb);
    }

    const connection = await MongoClient.connect(uri)
    console.log('=> creating a new connection');
    cachedDb = connection.db('russell_work');
    return Promise.resolve(cachedDb);
}

async function queryDatabase(db, server, isOnline) {

    console.log('=> query database');

    await db.collection('server_status').insert(
        { server, isOnline, timestamp: timestamp() },

    ).catch(err => {
        console.log('=> an error occurred: ', err);
        return { statusCode: 500, body: 'error adding to mongodb' }
    })

    return { server, isOnline }

}

const sendTelegramMsg = async (text) => {
    const headers = {'Content-Type': 'application/json'}
    const msg = {text, chat_id: '-1001125146235' }
    const resp = await fetch(`https://api.telegram.org/bot${process.env.GATES_ONLINE_SERVER_BOT_KEY}/sendMessage`, {method: "POST", body: JSON.stringify(msg), headers}).catch(err => console.log(err))
    if (resp.status != 200) console.log(resp)
}

const shouldSendAlert = async (db, isRussellOnline, isPeterOnline) => {
    let oldRussellEvent = await db.collection('server_status').find({server: russellServer}).sort({_id: -1}).limit(1).toArray()
    oldRussellEvent = oldRussellEvent.length > 0 ? oldRussellEvent[0]: null

    let oldPeterEvent = await db.collection('server_status').find({server: peterServer}).sort({_id: -1}).limit(1).toArray()
    oldPeterEvent = oldPeterEvent.length > 0 ? oldPeterEvent[0]: null
    if (oldRussellEvent && oldRussellEvent.isOnline != isRussellOnline) {
        const text = `${russellServer} ${isRussellOnline ? 'has come online!': 'has gone offline.'}`
        sendTelegramMsg(text);
    }
    if (oldPeterEvent && oldPeterEvent.isOnline != isPeterOnline) {
        const text = `${peterServer} has gone ${isPeterOnline ? 'has come online!': 'has gone offline.'}`
        sendTelegramMsg(text);
    }
}

const upTimeCalculation = async (db) => {
    return await Promise.all(supportedServers.map(async (server) => {
        const timesOnline = await db.collection('server_status').count({server, isOnline: true})
        const timesOffline = await db.collection('server_status').count({server, isOnline: false})
        return {uptimePercent: (timesOnline / (timesOnline + timesOffline))}
    }))

}

const executeMongo = async (event, context, callback) => {
    context.callbackWaitsForEmptyEventLoop = false;
    const db = await connectToDatabase(MONGODB_URI)

  
  
    let isRussellOnline = false
    let isPeterOnline = false

    const pete = await fetch(peterServer, { timeout: 1000 }).catch(err => {
        console.log(err)
    })
    const russell = await fetch(russellServer, { timeout: 1000 }).catch(err => {
        console.log(err)
    })
    if (pete && pete.status >= 200 && pete.status < 300) {
        isPeterOnline = true
    }
    if (russell && russell.status >= 200 && russell.status < 300) {
        isRussellOnline = true
    }

    console.log('https://russell.work online?', isRussellOnline)
    console.log('https://thegates.online online?', isPeterOnline)

    await shouldSendAlert(db, isRussellOnline, isPeterOnline )
    const peterResult = await queryDatabase(db, peterServer, isPeterOnline).catch(err => {
        console.log('=> an error occurred: ', err);
        callback(err);
    });
    const russellResult = await queryDatabase(db, russellServer, isRussellOnline).catch(err => {
        console.log('=> an error occurred: ', err);
        callback(err);
    });
    let results = [peterResult, russellResult]

    if (event.queryStringParameters && event.queryStringParameters.uptime === '1') {
        const uptimeData = await upTimeCalculation(db)
        results = uptimeData.map((uptime, i) => (
            {...uptime, ...results[i]}
        ))
    }
    const result = { statusCode: 200, body: JSON.stringify({servers: results}) }
    console.log('=> returning result: ', result);
    callback(null, result);

};
module.exports.handler = executeMongo

// executeMongo({body: {city: 'Hammondsville', state: "Ohio"}}, {}, {})

