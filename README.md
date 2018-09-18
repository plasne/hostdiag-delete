# hostdiag-delete
If you are using Azure VM Diagnostics and have hundreds of thousands or millions of metrics you need to delete, this can help.

A customer needed to delete ~200K entities in an Azure Storage Table. They tried using PowerShell but stopped it after 30 minutes of no status message - I do not know how long it would have taken.

CAUTION: This application is designed to delete entities from table storage very quickly, you need to be extremely careful you understand all the options and **test** it extensively to make sure it does what you expect. Use at your own risk, I am explicitly not providing any kind of guarantee.

## Installation

Install:
* [Node.js](https://nodejs.org/en/download/)
* [Git](https://git-scm.com/downloads)


```bash
git clone https://github.com/plasne/hostdiag-delete
cd hostdiag-delete
npm install
```

## Parameters

This application has a number of parameters that must be provided or can optionally be provided. You can get a complete list by typing "./delete.sh -help".

```bash
$ ./delete.sh --help
Usage: delete [options]

Options:

  -V, --version              output the version number
  -a, --account <s>          [REQUIRED] STORAGE_ACCOUNT. The name of the Azure Storage Account.
  -s, --sas <s>              [REQUIRED?] STORAGE_SAS. The Shared Access Signature querystring. Either STORAGE_SAS or STORAGE_KEY is required.
  -k, --key <s>              [REQUIRED?] STORAGE_KEY. The Azure Storage Account key. Either STORAGE_SAS or STORAGE_KEY is required.
  -t, --table <s>            [REQUIRED] STORAGE_TABLE. The name of the Azure Storage Table.
  -i, --subscription-id <s>  [REQUIRED?] SUBSCRIPTION_ID. The ID of the Azure Subscription containing the HOSTNAME.
  -g, --resource-group <s>   [REQUIRED?] RESOURCE_GROUP. The name of the Resource Group containing the HOSTNAME.
  -h, --hostname <s>         [REQUIRED?] HOSTNAME. The hostname of the VM that has the metrics you want to delete.
  -p, --partition-key <s>    [REQUIRED?] PARTITION_KEY. You must either specify SUBSCRIPTION_ID, RESOURCE_GROUP, and HOSTNAME or you can specify a PARTITION_KEY.
  -l, --log-level <s>        LOG_LEVEL. The minimum level to log to the console (error, warn, info, verbose, debug, silly). Defaults to "info".
  -m, --mode <s>             MODE. Can be "delete" or "test" (just shows what would be deleted). Defaults to "test".
  -b, --batch-size <i>       BATCH_SIZE. The number of delete operations to pack into a transaction. Defaults to "10".
  -x, --concurrency <i>      CONCURRENCY. The number of transactions to perform at a time. Defaults to "100".
  -e, --on-error <s>         ON_ERROR. When an error is encountered during delete, the process can "halt" or "continue". Default is "halt".
  -r, --retries <i>          RETRIES. You can specify a number of times to retry the deletion. Default is "0".
  -h, --help                 output usage information
```

There are several ways to provide these parameters. In order of precedence (command line preferred over variable or file, etc.):

1. Parameter provided on the command line.
2. Parameter set as an environment variable.
3. Parameter set in a .env file.

The .env file must be located in the folder you are executing the application from and should contain one environment variable per line as this example shows:

```bash
LOG_LEVEL=debug
ON_ERROR=continue
```

## Testing

Before you start deleting, you should run a test to make sure you understand what it going to be deleted (running in test mode is the default):

To test from macOS or Linux:

```bash
./delete.sh --account <storage_account> --key <storage_key> --table <table_name> \
--subscription-id <subId> --resource-group <rgName> --hostname <hostname>
```

To test from Windows (PowerShell):

```powershell
.\delete.bat --account <storage_account> --key <storage_key> --table <table_name> `
--subscription-id <subId> --resource-group <rgName> --hostname <hostname>
```

Either STORAGE_SAS (preferred) or STORAGE_KEY is required, but not both. STORAGE_SAS should be the entire string including the preceeding "?".

## Deletion

Once you have completed a test and are comfortable with what will be deleted, you can simply add "--mode delete" to your existing command. There are a few other options to consider though:

* BATCH_SIZE - The table deletions are done by executing batch commands. The number of rows deleted in a batch is determined by batch size. I did not experiment with different batch sizes, and honestly batching didn't improve performance much, but it is another lever you could play with if you need to tweak performance.

* CONCURRENCY - You might experiment with this value to see where you get the best rate. I did notice some generalizations between Windows (~20 is better) and Linux (~100 is better).

* ON_ERROR - The default is to "halt" on error, this is probably good to get started, but once you are confident, you might change this to "continue" for unattended execution.

* RETRIES - By default, the application will attempt to delete every entity once and then terminate. However, you can set some retries and when the application has attempted to delete everything once, it can go back and try and second time, third, etc. I did notice this was ever necessary, but it is an option anyway.

To delete from macOS or Linux:

```bash
./delete.sh --account <storage_account> --key <storage_key> --table <table_name> \
--subscription-id <subId> --resource-group <rgName> --hostname <hostname> --mode delete
```

To delete from Windows:

```powershell
.\delete.bat --account <storage_account> --key <storage_key> --table <table_name> `
--subscription-id <subId> --resource-group <rgName> --hostname <hostname> --mode delete
```

Example:

```bash
./delete.sh --account teststore --key aafe...g=== --table WADMetricsPT1MP10DV2S20180912 \
--subscription-id 00000000-0000-0000-0000-000000000000 --resource-group pelasne-rg \
--hostname pelasne-vm1 --mode delete --concurrency 20 --on-error continue
```

### PARTITION_KEY

This application was written specifically for deleting metrics from Azure Table Storage that was put there by Azure VM Diagnostics. Part of the challenge was understanding how to derive the PARTITION_KEY. If you are using the application for this purpose, you can specify: SUBSCRIPTION_ID, RESOURCE_GROUP, and HOSTNAME, and the PARTITION_KEY will be generated for you.

However, other than generating the PARTITION_KEY, this application has no specific logic for this use-case and could be used to delete all entities from any Azure Storage Table, provided you want to delete everything in a partition. To use the application this way, simply supply the PARTITION_KEY and not SUBSCRIPTION ID, RESOURCE_GROUP, and HOSTNAME.

Example:

```bash
./delete.sh --account teststore --key aafe...g=== --table WADMetricsPT1MP10DV2S20180912 \
--partition-key mykey --mode delete --on-error continue
```

## Performance

I observed performance between 1000 and 1700 deletes/second. Some things to consider to tweak performance:

* Running other operations in your storage account might be slowing this down.
* Running the delete from a VM in the same region might improve performance.
* You can get different results running with a different number of threads, you should play around with CONCURRENCY (and you might try BATCH_SIZE too, but I didn't notice a big difference).
* I got the best results running on a Saturday morning.

I did testing on a number of different VM sizes, the performance capped out with a D4v3, so you do not need anything bigger than that.

## Scalability

There are 2 activities going on during this process:

1. The list of entities is constantly being queried until this buffer exceeds 50,000. This process of iteration cannot be done in parallel (a pointer is being moved through the records). 

2. The deletion of entities is done in parallel at the specified CONCURRENCY with each trasaction deleting entities equal to BATCH_SIZE.

Given the first constraint, the maximum throughput (entities deleted per second) can be determined by running this application in test mode to see the iteration rate. Given perfect conditions, the deletion rate would match the iteration rate. To get close to that number, try adjusting CONCURRENCY.

Due to this same constraint, it does **not** benefit us to consider a more robust architecture (for example, scaling the deletion threads across Docker containers).

## Fragmentation

After deleting lots of entities you may notice fragmentation in the partitions. You can observe this by running the application in test mode and you may see that each page no longer returns 1000 records at a time, but only a few.

The garbage collection process seems to run quickly to fix this problem, but depending on how much data you delete, it could take some time.

## Windows vs. Linux

For this section assume the reference to "Linux" also includes macOS, while I realize they are not the same thing, the behavior was consistent.

* Windows tended to have better throughput at a lower number of threads, 20-30.
* Linux tended to have better throughput at a higher number of threads, ~100.
* Windows tended to run out of ephemeral ports from time to time. This could probably help: [https://docs.oracle.com/cd/E26180_01/Search.94/ATGSearchAdmin/html/s1207adjustingtcpsettingsforheavyload01.html](https://docs.oracle.com/cd/E26180_01/Search.94/ATGSearchAdmin/html/s1207adjustingtcpsettingsforheavyload01.html).
* As the CONCURRENCY gets higher, Windows tended to "leak" ephemeral ports (more were allocated than the connection pool) stipulated.

It honestly did not make that much difference in the final execution whether it was run on Windows or Linux, however, Linux will give a lot less errors and give you more room to fine-tune the CONCURRENCY.

## Architecture

There are a few architectural points that are worth calling out for those that are interested:

### Connection Pooling

This project uses the Azure Storage SDK for Node.js. That SDK allows the TableService to leverage the global HTTP/HTTPS agent. I set the maxSockets to "CONCURRENCY + 20" and keepAlive to "true".

### Fetch

In both test and delete mode, a "fetch" process runs to get the first set of entities (should be ~1,000). As soon as that set returns, another fetch is immediately started with the appropriate offset.

In the case of test mode, each entity's RowKey is written to the logger and discarded. This continues until the list of all entities has completed.

In the case of delete mode, the entities are added to a buffer. The buffer is drained as described in the next section. The buffer is continually refilled by calling another fetch unless the buffer reaches 50k. At 50k, the fetch process delays for 1 second. If the buffer is below 50k, it will fetch more, otherwise, it will defer for another 1 second and so on. This behavior ensures that the buffer doesn't get too big and overflow the memory.

### Delete

I used [es6-promise-pool](https://www.npmjs.com/package/es6-promise-pool) to manage draining the buffer by deleting entities. This module allows you to create a "producer" function that spits out Promises. Every time the pool drops below the desired CONCURRENCY, it asks the producer for another Promise. This elegant design ensures that the pool is always processing at the desired peak.

There are 3 things that can happen in the producer function:

1. The buffer could have 1 or more entities, in which case it will create a batch up to BATCH_SIZE and return a promise to delete that batch.

2. The buffer could be empty but the fetch process is not done, in which case it create a Promise to delay for 1 second.

3. The buffer could be empty with nothing more to fetch, it will return "undefined". This triggers the pool to stop asking for new Promises.

## Future Enhancements

* I would like to add a RegExp tester instead of simply PARTITION_KEY to be more flexible.
