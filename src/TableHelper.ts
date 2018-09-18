
// includes
import * as azs from "azure-storage";
import * as util from "util";
import { EventEmitter } from "events";

export interface TableHelperJSON {
    service?:          azs.TableService,
    connectionString?: string,
    account?:          string,
    sas?:              string,
    key?:              string,
    useGlobalAgent?:   boolean,
    name:              string
}

export default class TableHelper {

    public events:  EventEmitter = new EventEmitter();
    public service: azs.TableService;
    public name:    string;

    // execute the actual logic to run the query
    public query<T>(query: azs.TableQuery) {
        const emitter = new EventEmitter();
        let count: number = 0;

        // allow for the stream to be paused
        let paused: boolean = false;
        emitter
            .on("pause", () => {
                paused = true;
            })
            .on("resume", () => {
                paused = false;
            });

        // promify
        const queryEntities: (table: string, query: azs.TableQuery, token?: azs.TableService.TableContinuationToken) =>
            Promise<azs.TableService.QueryEntitiesResult<T>> = util.promisify(azs.TableService.prototype.queryEntities).bind(this.service);
        
        // define the recursive fetch function
        const fetch = async (token?: azs.TableService.TableContinuationToken) => {
            this.events.emit("verbose", `getting entities "${this.name}"...`);
            const result = await queryEntities(this.name, query, token);
            for (const entry of result.entries) {
                emitter.emit("entity", entry);
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

            } else {
                emitter.emit("done");
            }
        }

        // start
        fetch();

        return emitter;
    }

    public delete(partitionKey: string, rowKey: string) {
        return new Promise<azs.ServiceResponse>((resolve, reject) => {
            try {
                this.service.deleteEntity(this.name, {
                    PartitionKey: partitionKey,
                    RowKey: rowKey
                }, (error, response) => {
                    if (!error) {
                        resolve(response);
                    } else {
                        reject(error);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    public commit(batch: azs.TableBatch) {
        return new Promise<azs.TableService.BatchResult[]>((resolve, reject) => {
            try {
                this.service.executeBatch(this.name, batch, (error, result) => {
                   if (!error) {
                       resolve(result);
                   } else {
                       reject(error);
                   }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    constructor(obj: TableHelperJSON) {

        // establish the service
        if (obj.service) {
            this.service = obj.service;
        } else if (obj.connectionString) {
            this.service = azs.createTableService(obj.connectionString);
            if (obj.useGlobalAgent) this.service.enableGlobalHttpAgent = true;
        } else if (obj.account && obj.sas) {
            const host = `https://${obj.account}.table.core.windows.net`;
            this.service = azs.createTableServiceWithSas(host, obj.sas);
            if (obj.useGlobalAgent) this.service.enableGlobalHttpAgent = true;
        } else if (obj.account && obj.key) {
            this.service = azs.createTableService(obj.account, obj.key);
            if (obj.useGlobalAgent) this.service.enableGlobalHttpAgent = true;
        } else {
            throw new Error(`You must specify service, connectionString, account/sas, or account/key.`)
        }

        // record the table name
        this.name = obj.name;

    }

}