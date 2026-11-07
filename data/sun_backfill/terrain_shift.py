import cv2,numpy as np,glob,sys,os
P='/volume1/pano_test/'
def prof(run,where=0.5):
    ps=sorted(glob.glob(P+run+'/panos/*.jpg'));
    if not ps: return None
    acc=None
    i=min(max(int(len(ps)*where),2),len(ps)-3)
    for p in ps[i-2:i+3]:
        im=cv2.imread(p,cv2.IMREAD_GRAYSCALE).astype(np.float32); h,w=im.shape
        im=cv2.resize(im,(3600,int(h*3600/w)))   # 0.1 deg per column
        b=im[int(im.shape[0]*0.62):int(im.shape[0]*0.95)]
        g=np.abs(np.diff(b,axis=1,append=b[:,:1])).mean(axis=0)
        acc=g if acc is None else acc+g
    return acc-acc.mean()
def shift(a,b):
    x=np.real(np.fft.ifft(np.fft.fft(a)*np.conj(np.fft.fft(b)))); k=int(np.argmax(x)); k=k if k<1800 else k-3600
    return k/10, x.max()/np.sqrt((a*a).sum()*(b*b).sum())
ref=prof(sys.argv[1])
for r in sys.argv[2:]:
    out=[]
    for wh in (0.03,0.5,0.97):
        q=prof(r,wh)
        if q is None: break
        s,c=shift(q,ref); out.append(f"{s:+.1f}/{c:.2f}")
    print(r+"\t"+"\t".join(out),flush=True)
