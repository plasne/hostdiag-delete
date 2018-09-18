# hostdiag-delete
If you are using Azure VM Diagnostics and have hundreds of thousands or millions of metrics you need to delete, this can help.

## Installation

```bash
git clone https://github.com/plasne/hostdiag-delete
cd hostdiag-delete
npm install
```

## Execution

To test from macOS or Linux:

```bash
./delete.sh --account <storage_account> --key <storage_key> --table <table_name> \
--subscription-id <subId> --resource-group <rgName> --hostname <hostname> --mode test
```

To delete from macOS or Linux:

```bash
./delete.sh --account <storage_account> --key <storage_key> --table <table_name> \
--subscription-id <subId> --resource-group <rgName> --hostname <hostname> --mode delete
```

To test from Windows:

```powershell
.\delete.bat --account <storage_account> --key <storage_key> --table <table_name> `
--subscription-id <subId> --resource-group <rgName> --hostname <hostname> --mode test
```

To delete from Windows:

```powershell
.\delete.bat --account <storage_account> --key <storage_key> --table <table_name> `
--subscription-id <subId> --resource-group <rgName> --hostname <hostname> --mode delete
```
