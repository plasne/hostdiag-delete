"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// includes
require("dotenv").config();
const cmd = require("commander");
const winston = __importStar(require("winston"));
const azs = __importStar(require("azure-storage"));
const TableHelper_1 = __importDefault(require("./TableHelper"));
const readline = __importStar(require("readline"));
const es6_promise_pool_1 = __importDefault(require("es6-promise-pool"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
// define command line parameters
cmd
    .version("0.1.0")
    .option("-a, --account <s>", `[REQUIRED] STORAGE_ACCOUNT. The name of the Azure Storage Account.`)
    .option("-s, --sas <s>", `[REQUIRED?] STORAGE_SAS. The Shared Access Signature querystring. Either STORAGE_SAS or STORAGE_KEY is required.`)
    .option("-k, --key <s>", `[REQUIRED?] STORAGE_KEY. The Azure Storage Account key. Either STORAGE_SAS or STORAGE_KEY is required.`)
    .option("-t, --table <s>", `[REQUIRED] STORAGE_TABLE. The name of the Azure Storage Table.`)
    .option("-i, --subscription-id <s>", `[REQUIRED?] SUBSCRIPTION_ID. The ID of the Azure Subscription containing the HOSTNAME.`)
    .option("-g, --resource-group <s>", `[REQUIRED?] RESOURCE_GROUP. The name of the Resource Group containing the HOSTNAME.`)
    .option("-h, --hostname <s>", `[REQUIRED?] HOSTNAME. The hostname of the VM that has the metrics you want to delete.`)
    .option("-p, --partition-key <s>", `[REQUIRED?] PARTITION_KEY. You must either specify SUBSCRIPTION_ID, RESOURCE_GROUP, and HOSTNAME or you can specify a PARTITION_KEY.`)
    .option("-l, --log-level <s>", `LOG_LEVEL. The minimum level to log to the console (error, warn, info, verbose, debug, silly). Defaults to "info".`, /^(error|warn|info|verbose|debug|silly)$/i)
    .option("-m, --mode <s>", `MODE. Can be "delete" or "test" (just shows what would be deleted). Defaults to "test".`)
    .option("-b, --batch-size <i>", `BATCH_SIZE. The number of delete operations to pack into a transaction. Defaults to "10".`, parseInt)
    .option("-x, --concurrency <i>", `CONCURRENCY. The number of transactions to perform at a time. Defaults to "100".`, parseInt)
    .option("-e, --on-error <s>", `ON_ERROR. When an error is encountered during delete, the process can "halt" or "continue". Default is "halt".`)
    .option("-r, --retries <i>", `RETRIES. You can specify a number of times to retry the deletion. Default is "0".`, parseInt)
    .parse(process.argv);
// globals
const LOG_LEVEL = cmd.logLevel || process.env.LOG_LEVEL || "info";
const STORAGE_ACCOUNT = cmd.account || process.env.STORAGE_ACCOUNT;
const STORAGE_SAS = cmd.sas || process.env.STORAGE_SAS;
const STORAGE_KEY = cmd.key || process.env.STORAGE_KEY;
const STORAGE_TABLE = cmd.table || process.env.STORAGE_TABLE;
const SUBSCRIPTION_ID = cmd.subscriptionId || process.env.SUBSCRIPTION_ID;
const RESOURCE_GROUP = cmd.resourceGroup || process.env.RESOURCE_GROUP;
const HOSTNAME = cmd.hostname || process.env.HOSTNAME;
const MODE = cmd.mode || process.env.MODE || "test";
let BATCH_SIZE = cmd.batchSize || process.env.BATCH_SIZE || 10;
BATCH_SIZE = parseInt(BATCH_SIZE);
if (isNaN(BATCH_SIZE))
    BATCH_SIZE = 10;
let CONCURRENCY = cmd.concurrency || process.env.CONCURRENCY || 100;
CONCURRENCY = parseInt(CONCURRENCY);
if (isNaN(CONCURRENCY))
    CONCURRENCY = 100;
const ON_ERROR = cmd.onError || process.env.ON_ERROR || "halt";
let RETRIES = cmd.retries || process.env.RETRIES || 0;
RETRIES = parseInt(RETRIES);
if (isNaN(RETRIES))
    RETRIES = 100;
// create the PARTITION_KEY
let PARTITION_KEY = cmd.partitionKey || process.env.PARTITION_KEY;
if (!PARTITION_KEY) {
    const unformatted = `/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachines/${HOSTNAME}`;
    PARTITION_KEY = "";
    for (let i = 0; i < unformatted.length; i++) {
        const code = unformatted.charCodeAt(i);
        if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
            // digit, A-Z, a-z
            PARTITION_KEY += unformatted[i];
        }
        else {
            // everything else, unicode
            PARTITION_KEY += ":" + code.toString(16).toUpperCase().padStart(4, "0");
        }
    }
}
// modify the agents
const httpAgent = http.globalAgent;
httpAgent.keepAlive = true;
httpAgent.maxSockets = CONCURRENCY + 20;
const httpsAgent = https.globalAgent;
httpsAgent.keepAlive = true;
httpsAgent.maxSockets = CONCURRENCY + 20;
// enable logging
const logColors = {
    "error": "\x1b[31m",
    "warn": "\x1b[33m",
    "info": "",
    "verbose": "\x1b[32m",
    "debug": "\x1b[32m",
    "silly": "\x1b[32m" // green
};
const transport = new winston.transports.Console({
    format: winston.format.combine(winston.format.timestamp(), winston.format.printf(event => {
        const color = logColors[event.level] || "";
        const level = event.level.padStart(7);
        return `${event.timestamp} ${color}${level}\x1b[0m: ${event.message}`;
    }))
});
const logger = winston.createLogger({
    level: LOG_LEVEL,
    transports: [transport]
});
// log startup
console.log(`LOG_LEVEL set to "${LOG_LEVEL}".`);
logger.info(`STORAGE_ACCOUNT = "${STORAGE_ACCOUNT}".`);
logger.info(`STORAGE_KEY is ${(STORAGE_KEY) ? "defined" : "undefined"}.`);
logger.info(`STORAGE_SAS is ${(STORAGE_SAS) ? "defined" : "undefined"}.`);
logger.info(`STORAGE_TABLE = "${STORAGE_TABLE}".`);
logger.info(`SUBSCRIPTION_ID = "${SUBSCRIPTION_ID}".`);
logger.info(`RESOURCE_GROUP = "${RESOURCE_GROUP}".`);
logger.info(`HOSTNAME = "${HOSTNAME}".`);
logger.info(`PARTITION_KEY = "${PARTITION_KEY}".`);
logger.info(`MODE = "${MODE}".`);
logger.info(`CONCURRENCY = "${CONCURRENCY}".`);
logger.info(`ON_ERROR = "${ON_ERROR}".`);
logger.info(`RETRIES = "${RETRIES}".`);
// check requirements
if (!STORAGE_ACCOUNT)
    throw new Error("You must specify STORAGE_ACCOUNT in either .env or command line.");
if (!STORAGE_KEY && !STORAGE_SAS)
    throw new Error("You must specify either STORAGE_KEY or STORAGE_SAS in either .env or command line.");
if (!STORAGE_TABLE)
    throw new Error("You must specify STORAGE_TABLE in either .env or command line.");
if (!SUBSCRIPTION_ID)
    throw new Error("You must specify SUBSCRIPTION_ID in either .env or command line.");
if (!RESOURCE_GROUP)
    throw new Error("You must specify RESOURCE_GROUP in either .env or command line.");
if (!HOSTNAME)
    throw new Error("You must specify HOSTNAME in either .env or command line.");
// connect to the table
const table = new TableHelper_1.default({
    account: STORAGE_ACCOUNT,
    sas: STORAGE_SAS,
    key: STORAGE_KEY,
    name: STORAGE_TABLE
});
// define the query
const query = new azs.TableQuery()
    .select("PartitionKey, RowKey")
    .where("PartitionKey eq ?", PARTITION_KEY);
// execute
(async () => {
    // perform a test
    if (MODE.toLowerCase() === "test") {
        let start = new Date();
        let count = 0;
        // define fetch promise
        const fetch = () => {
            return new Promise((resolve, reject) => {
                try {
                    table
                        .query(query)
                        .on("entity", (entity) => {
                        logger.log("debug", entity.RowKey._);
                        count++;
                    })
                        .on("done", () => {
                        resolve();
                    });
                }
                catch (error) {
                    reject(error);
                }
            });
        };
        // show progress
        const progress = () => {
            const now = new Date();
            const elapsed = (now.valueOf() - start.valueOf()) / 1000;
            if (count > 0) {
                logger.info(`${count} entity(s) listed after ${(elapsed / 60).toFixed(2)} minutes, ${Math.round(count / elapsed)}/sec.`);
            }
            else {
                logger.info(`${count} entity(s) listed after ${(elapsed / 60).toFixed(2)} minutes.`);
            }
        };
        // handle graceful shutdown
        process.on("SIGINT", () => {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
            logger.info(`user terminated the execution.`);
            progress();
            process.exit(0);
        });
        // start fetching
        const i = setInterval(progress, 1000);
        await fetch();
        // done
        clearInterval(i);
        progress();
    }
    // perform a delete
    if (MODE.toLowerCase() === "delete") {
        let start = new Date();
        let mode = "initializing";
        let count = 0;
        let retries = 0;
        const buffer = [];
        // define fetch promise
        const fetch = () => {
            return new Promise((resolve, reject) => {
                try {
                    // reset counter
                    mode = "initializing";
                    // start the streaming query
                    const emitter = table
                        .query(query)
                        .on("readable", () => {
                        mode = "fetching";
                    })
                        .on("data", (entity) => {
                        // fill the buffer
                        buffer.push(entity);
                        // should the buffer get about 50,000 pause it for a while
                        if (buffer.length > 50000) {
                            mode = "waiting";
                            emitter.emit("pause");
                            const interval = setInterval(() => {
                                if (buffer.length < 50000) {
                                    clearInterval(interval);
                                    mode = "fetching";
                                    emitter.emit("resume");
                                }
                            }, 1000);
                        }
                    })
                        .on("end", () => {
                        mode = "done";
                        resolve();
                    });
                }
                catch (error) {
                    reject(error);
                }
            });
        };
        // show progress
        const progress = () => {
            const now = new Date();
            const elapsed = (now.valueOf() - start.valueOf()) / 1000;
            if (count > 0) {
                logger.info(`${count} entity(s) deleted after ${(elapsed / 60).toFixed(2)} minutes, ${Math.round(count / elapsed)}/sec, buffer: ${buffer.length}${(mode === "waiting") ? " (paused)" : ""}.`);
            }
            else {
                logger.info(`${count} entity(s) deleted after ${(elapsed / 60).toFixed(2)} minutes, buffer: ${buffer.length}${(mode === "waiting") ? " (paused)" : ""}.`);
            }
        };
        // gracefully shutdown
        process.on("SIGINT", () => {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);
            logger.info(`user terminated the execution.`);
            progress();
            process.exit(0);
        });
        // build a producer of delete promises
        const producer = () => {
            if (buffer.length > 0) {
                // delete next
                // batch operations
                const set = buffer.splice(0, BATCH_SIZE);
                const batch = new azs.TableBatch();
                for (let i = 0; i < set.length; i++) {
                    batch.deleteEntity(set[i]);
                }
                // execute the transaction
                const deletions = table.commit(batch).then(() => {
                    count += batch.size();
                }).catch(error => {
                    if (ON_ERROR.toLowerCase() === "continue") {
                        logger.error(`There was an error deleting a batch, but we will continue.`);
                        logger.error(error.stack);
                    }
                    else {
                        logger.error(`There was a fatal error. Program aborting after ${count} deleted.`);
                        logger.error(error.stack);
                        process.exit(1);
                    }
                });
                return deletions;
            }
            else if (mode === "initializing") {
                // waiting on the first population of the buffer
                //  NOTE: suppressing messages
                return new Promise(resolve => setTimeout(resolve, 1000));
            }
            else if (mode !== "done") {
                // delay for 1 second, hopefully there will be more in the buffer
                logger.debug(`waiting on buffer to refill...`);
                return new Promise(resolve => setTimeout(resolve, 1000));
            }
            else {
                // we are done
                return undefined;
            }
        };
        // fetch, delete, retry
        do {
            // fetch another set
            count = 0;
            fetch();
            // start showing progress
            const i = setInterval(progress, 1000);
            // start the cycle
            const pool = new es6_promise_pool_1.default(producer, CONCURRENCY);
            await pool.start();
            logger.info(`delete operation completed`);
            progress();
            // stop showing progress
            clearInterval(i);
            // retry
            retries++;
            if (retries <= RETRIES)
                logger.info(`beginning retry attempt ${retries}.`);
        } while (retries <= RETRIES);
    }
})();
