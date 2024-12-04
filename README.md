Use Docker:

```bash
docker build -t ufactory_docs_service . 



docker save -o ufactory_docs_service.tar ufactory_docs_service

scp .\ufactory_docs_service.tar uf@192.168.1.176:/home/uf/Downloads

docker load -i ufactory_docs_service.tar

docker run -it --name ufactory_docs_service --restart=always -d -p 3000:3000 -p 3040:3040 ufactory_docs_service

docker exec -it ufactory_docs_service /bin/bash

npx puppeteer browsers install chrome

ssh-keygen -t rsa -b 4096 -C "garminzjm@gmail.com"

./shells/rsync.sh 

# /*********************************** 

# logs
docker logs -f ufactory_docs

# shell
docker exec -it ufactory_docs /bin/bash

# stop container
docker stop ufactory_docs

# remove container
docker rm ufactory_docs

# start containers
docker start ufactory_docs

# images
docker images

# remove image
docker rmi 5130d8e737ad

```


<!-- npx puppeteer browsers install chrome -->

### ftp
```bash
sudo useradd -m ftpuser
sudo passwd ftpuser
# 开启ftp
sudo systemctl restart vsftpd


# 设置用户的 FTP 主目录（可选）
# 如果需要为 FTP 用户指定特定的主目录，可以使用sudo usermod -d /path/to/directory ftpuser命令，将/path/to/directory替换为实际的目录路径 ，比如sudo usermod -d /var/www/html/ftp ftpuser.
```


### ssh
>登录不了ssh 没有权限可能是：
```bash
# 修改pem文件权限
icacls "D:\code\ufactory_docs.pem" /inheritance:r
icacls "D:\code\ufactory_docs.pem" /grant:r "$($env:USERNAME):(R)"

# 服务器文件权限
sudo chown root:root /home
sudo chmod 755 /home
sudo chown ec2-user:ec2-user /home/ec2-user -R
sudo chmod 700 /home/ec2-user /home/ec2-user/.ssh
sudo chmod 600 /home/ec2-user/.ssh/authorized_keys
```


### ssh
```bash

# 创建ssh
 ssh-keygen -t rsa -b 4096 -C "garminzjm@gmail.com"

# cat
cat /home/garmin/.ssh/id_rsa.pub

# 添加公钥
sudo vim  ~/.ssh/authorized_keys
 ```

```
RUN npx puppeteer browsers install chrome
```
