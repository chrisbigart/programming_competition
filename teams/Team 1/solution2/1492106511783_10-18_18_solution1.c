#include <stdio.h>
#include <stdlib.h>

int main(int argc, char** argv)
	{
	char* output;
	int count;
	int i;

	if(argc != 3)
		return -1;

	output = argv[2];
	count = atoi(argv[1]);

	for(i = 0; i < count; i++)	
		printf("%s\n", output);

	return 0;
	}
