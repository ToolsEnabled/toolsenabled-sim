using System;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class SimFileHandle {
  [StructLayout(LayoutKind.Sequential)]
  private struct Information {
    public uint Attributes;
    public System.Runtime.InteropServices.ComTypes.FILETIME Created;
    public System.Runtime.InteropServices.ComTypes.FILETIME Accessed;
    public System.Runtime.InteropServices.ComTypes.FILETIME Written;
    public uint Volume;
    public uint SizeHigh;
    public uint SizeLow;
    public uint Links;
    public uint IndexHigh;
    public uint IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Information info);
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern uint GetFileType(SafeFileHandle handle);
  [DllImport("advapi32.dll", SetLastError=true)]
  private static extern uint GetSecurityInfo(SafeFileHandle handle, int objectType, uint securityInfo, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
  [DllImport("advapi32.dll", SetLastError=true)]
  private static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr memory);

  public sealed class Metadata {
    public string FileId;
    public string Volume;
    public uint Links;
    public bool Directory;
    public byte[] Security;
  }
  public static Metadata Inspect(string path) {
    // READ_CONTROL | FILE_READ_ATTRIBUTES. OPEN_REPARSE_POINT opens the last
    // component itself; no link payload is read. Ancestors are checked by the
    // caller. BACKUP_SEMANTICS permits a directory handle without privileges.
    using (SafeFileHandle handle=CreateFileW(path, 0x00020080, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)) {
      if (handle.IsInvalid || GetFileType(handle)!=1) throw new InvalidOperationException("FILE_HANDLE_UNAVAILABLE");
      Information info;
      if (!GetFileInformationByHandle(handle, out info)) throw new InvalidOperationException("FILE_IDENTITY_UNAVAILABLE");
      if ((info.Attributes & 0x400)!=0) throw new InvalidOperationException("REPARSE_POINT_REFUSED");
      bool directory=(info.Attributes & 0x10)!=0;
      if (!directory && info.Links!=1) throw new InvalidOperationException("HARD_LINK_REFUSED");
      IntPtr owner,group,dacl,sacl,descriptor;
      uint result=GetSecurityInfo(handle,1,5,out owner,out group,out dacl,out sacl,out descriptor);
      if (result!=0 || descriptor==IntPtr.Zero) throw new InvalidOperationException("FILE_SECURITY_UNAVAILABLE");
      try {
        uint length=GetSecurityDescriptorLength(descriptor);
        if (length==0 || length>65536) throw new InvalidOperationException("FILE_SECURITY_SIZE_REFUSED");
        byte[] bytes=new byte[length]; Marshal.Copy(descriptor,bytes,0,(int)length);
        ulong fileId=((ulong)info.IndexHigh<<32)|info.IndexLow;
        if (fileId==0) throw new InvalidOperationException("FILE_IDENTITY_UNAVAILABLE");
        return new Metadata {FileId=fileId.ToString(CultureInfo.InvariantCulture),Volume=info.Volume.ToString(CultureInfo.InvariantCulture),Links=info.Links,Directory=directory,Security=bytes};
      } finally {LocalFree(descriptor);}
    }
  }
}
