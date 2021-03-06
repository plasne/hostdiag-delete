"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// includes
const azs = __importStar(require("azure-storage"));
const util = __importStar(require("util"));
const events_1 = require("events");
class TableHelper {
    constructor(obj) {
        this.events = new events_1.EventEmitter();
        // establish the service
        if (obj.service) {
            this.service = obj.service;
        }
        else if (obj.connectionString) {
            this.service = azs.createTableService(obj.connectionString);
            if (obj.useGlobalAgent)
                this.service.enableGlobalHttpAgent = true;
        }
        else if (obj.account && obj.sas) {
            const host = `https://${obj.account}.table.core.windows.net`;
            this.service = azs.createTableServiceWithSas(host, obj.sas);
            if (obj.useGlobalAgent)
                this.service.enableGlobalHttpAgent = true;
        }
        else if (obj.account && obj.key) {
            this.service = azs.createTableService(obj.account, obj.key);
            if (obj.useGlobalAgent)
                this.service.enableGlobalHttpAgent = true;
        }
        else {
            throw new Error(`You must specify service, connectionString, account/sas, or account/key.`);
        }
        // record the table name
        this.name = obj.name;
    }
    // execute the actual logic to run the query
    query(query) {
        const emitter = new events_1.EventEmitter();
        let count = 0;
        // allow for the stream to be paused
        let paused = false;
        emitter
            .on("pause", () => {
            paused = true;
        })
            .on("resume", () => {
            paused = false;
        });
        // promify
        const queryEntities = util.promisify(azs.TableService.prototype.queryEntities).bind(this.service);
        // define the recursive fetch function
        const fetch = async (token) => {
            this.events.emit("verbose", `getting entities "${this.name}"...`);
            const result = await queryEntities(this.name, query, token);
            for (const entry of result.entries) {
                // emit "primed" this was the first return
                if (count === 0)
                    emitter.emit("readable");
                // emit the entity
                emitter.emit("data", entry);
                count++;
            }
            this.events.emit("verbose", `${count} entities enumerated thusfar...`);
            if (result.continuationToken) {
                // respect a pause before continuing
                while (paused) {
                    this.events.emit("debug", `entity enumeration paused for 1 second.`);
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
                fetch(result.continuationToken);
            }
            else {
                emitter.emit("end");
                emitter.emit("done");
            }
        };
        // start
        fetch();
        return emitter;
    }
    delete(partitionKey, rowKey) {
        return new Promise((resolve, reject) => {
            try {
                this.service.deleteEntity(this.name, {
                    PartitionKey: partitionKey,
                    RowKey: rowKey
                }, (error, response) => {
                    if (!error) {
                        resolve(response);
                    }
                    else {
                        reject(error);
                    }
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    commit(batch) {
        return new Promise((resolve, reject) => {
            try {
                this.service.executeBatch(this.name, batch, (error, result) => {
                    if (!error) {
                        resolve(result);
                    }
                    else {
                        reject(error);
                    }
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
}
exports.default = TableHelper;
