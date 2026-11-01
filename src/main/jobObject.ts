// Ties child processes to GameMate's lifetime with a Windows job object: when GameMate exits
// for any reason (even a crash or being killed), Windows closes the AI engine too.
import koffi from 'koffi'

const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
const PROCESS_TERMINATE = 0x0001
const PROCESS_SET_QUOTA = 0x0100

interface Kernel32 {
  createJobObject: (attributes: null, name: null) => unknown
  setInformationJobObject: (job: unknown, infoClass: number, info: object, size: number) => number
  openProcess: (access: number, inherit: number, pid: number) => unknown
  assignProcessToJobObject: (job: unknown, process: unknown) => number
  closeHandle: (handle: unknown) => number
  infoSize: number
}

let kernel32: Kernel32 | null = null
// Kept open for GameMate's whole life; Windows closes it (and the engine) when GameMate exits.
let job: unknown = null

function api(): Kernel32 {
  if (kernel32) return kernel32
  const lib = koffi.load('kernel32.dll')
  const basic = koffi.struct('JOBOBJECT_BASIC_LIMIT_INFORMATION', {
    PerProcessUserTimeLimit: 'int64',
    PerJobUserTimeLimit: 'int64',
    LimitFlags: 'uint32',
    MinimumWorkingSetSize: 'size_t',
    MaximumWorkingSetSize: 'size_t',
    ActiveProcessLimit: 'uint32',
    Affinity: 'uintptr_t',
    PriorityClass: 'uint32',
    SchedulingClass: 'uint32'
  })
  const io = koffi.struct('IO_COUNTERS', {
    ReadOperationCount: 'uint64',
    WriteOperationCount: 'uint64',
    OtherOperationCount: 'uint64',
    ReadTransferCount: 'uint64',
    WriteTransferCount: 'uint64',
    OtherTransferCount: 'uint64'
  })
  const extended = koffi.struct('JOBOBJECT_EXTENDED_LIMIT_INFORMATION', {
    BasicLimitInformation: basic,
    IoInfo: io,
    ProcessMemoryLimit: 'size_t',
    JobMemoryLimit: 'size_t',
    PeakProcessMemoryUsed: 'size_t',
    PeakJobMemoryUsed: 'size_t'
  })
  kernel32 = {
    createJobObject: lib.func('void* __stdcall CreateJobObjectW(void* attributes, void* name)'),
    setInformationJobObject: lib.func(
      'int __stdcall SetInformationJobObject(void* job, int infoClass, _In_ JOBOBJECT_EXTENDED_LIMIT_INFORMATION* info, uint32 size)'
    ),
    openProcess: lib.func('void* __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)'),
    assignProcessToJobObject: lib.func(
      'int __stdcall AssignProcessToJobObject(void* job, void* process)'
    ),
    closeHandle: lib.func('int __stdcall CloseHandle(void* handle)'),
    infoSize: koffi.sizeof(extended)
  }
  return kernel32
}

function createJob(k: Kernel32): unknown {
  const handle = k.createJobObject(null, null)
  if (!handle) return null
  const zeroIo = {
    ReadOperationCount: 0,
    WriteOperationCount: 0,
    OtherOperationCount: 0,
    ReadTransferCount: 0,
    WriteTransferCount: 0,
    OtherTransferCount: 0
  }
  const info = {
    BasicLimitInformation: {
      PerProcessUserTimeLimit: 0,
      PerJobUserTimeLimit: 0,
      LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
      MinimumWorkingSetSize: 0,
      MaximumWorkingSetSize: 0,
      ActiveProcessLimit: 0,
      Affinity: 0,
      PriorityClass: 0,
      SchedulingClass: 0
    },
    IoInfo: zeroIo,
    ProcessMemoryLimit: 0,
    JobMemoryLimit: 0,
    PeakProcessMemoryUsed: 0,
    PeakJobMemoryUsed: 0
  }
  if (!k.setInformationJobObject(handle, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, info, k.infoSize)) {
    k.closeHandle(handle)
    return null
  }
  return handle
}

// Best effort: if it fails, GameMate still stops the engine itself when it quits normally.
export function tieToGameMate(pid: number | undefined): boolean {
  if (process.platform !== 'win32' || !pid) return false
  try {
    const k = api()
    job ??= createJob(k)
    if (!job) return false
    const child = k.openProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid)
    if (!child) return false
    const ok = k.assignProcessToJobObject(job, child) !== 0
    k.closeHandle(child)
    return ok
  } catch (error) {
    console.warn('Could not tie the AI engine to GameMate', error)
    return false
  }
}
